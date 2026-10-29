#!/usr/bin/env python3
"""
Simplifica os nomes de servidores em src/data/liveChannels.ts.

Renomeia TODOS os `name: 'Servidor ...'` dentro de cada bloco `servers: [...]`
para `Servidor 1`, `Servidor 2`, `Servidor 3`... baseado em posição dentro do
array. Cobre os 3 padrões existentes:
  - 'Servidor N (DESCRIÇÃO)'  -> 'Servidor N'
  - 'Servidor Oficial ...'    -> 'Servidor N'
  - 'Servidor Backup (...)'   -> 'Servidor N'
  - 'Servidor Proxy ...'      -> 'Servidor N'

State machine: entra em modo "servers block" ao ver `servers: [` no início de
linha; conta cada `name: 'Servidor...'` dentro do bloco; sai do modo ao ver
`]` no nível de indentação do `servers:`.

Uso:
  python3 scripts/simplify_live_channel_servers.py [--dry-run] [--in PATH]
"""
import argparse
import re
import sys
from pathlib import Path

DEFAULT_IN = "src/data/liveChannels.ts"

# Match: `        name: 'Servidor...',` (qualquer indent, mas a linha tem que
# ter `name: 'Servidor` + algo entre aspas simples + vírgula final).
# IMPORTANTE: usar [ \t] em vez de \s no grupo trailing pra NÃO consumir o \n
# final da linha (senão o output ganha \n duplicado).
NAME_RE = re.compile(r"^(\s*)name:\s*'Servidor[^']*'([ \t]*,?[ \t]*)$")

# Match: `    servers: [` (fim da linha, abre block)
SERVERS_OPEN_RE = re.compile(r"^(\s*)servers:\s*\[\s*$")


def simplify(in_path: Path, dry_run: bool = False) -> int:
    text = in_path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)

    out: list[str] = []
    in_block = False
    counter = 0
    block_indent: int | None = None
    changes = 0

    for line in lines:
        # Detecta abertura de servers: [
        m_open = SERVERS_OPEN_RE.match(line)
        if m_open:
            in_block = True
            counter = 0
            block_indent = len(m_open.group(1))
            out.append(line)
            continue

        if in_block:
            stripped_lead = line[: len(line) - len(line.lstrip())]
            cur_indent = len(stripped_lead)
            stripped = line.lstrip()
            # Detecta fechamento do block (']' no mesmo nível ou menor)
            if stripped.startswith("]") and cur_indent <= (block_indent or 0):
                in_block = False
                block_indent = None
                out.append(line)
                continue

            # Match name: 'Servidor...'
            m_name = NAME_RE.match(line)
            if m_name:
                counter += 1
                indent = m_name.group(1)
                trailing = m_name.group(2) or ","
                # se trailing não tem vírgula, mantém
                if not trailing.strip().endswith(","):
                    trailing = ","
                out.append(f"{indent}name: 'Servidor {counter}'{trailing}\n"
                           if line.endswith("\n")
                           else f"{indent}name: 'Servidor {counter}'{trailing}")
                changes += 1
                continue

            # Outras linhas dentro do block: unchanged
            out.append(line)
            continue

        out.append(line)

    new_text = "".join(out)

    # Segundo pass: padrões INLINE (não-multilinha) — ex.:
    #   { name: 'Servidor 1 (Multi-Fonte HD)', url: '...', isProxy: false }
    # Esses são capturados numa única linha e o state machine acima não pega
    # (porque o name: não tá no início da linha). Strippa o `(DESCRIÇÃO)`
    # mantendo o número já existente.
    inline_re = re.compile(r"name:\s*'Servidor (\d+) \([^)]*\)'")
    new_text, inline_count = inline_re.subn(r"name: 'Servidor \1'", new_text)
    if inline_count:
        changes += inline_count
        if dry_run:
            sys.stdout.write(f"[DRY-RUN] + {inline_count} padrões inline strippados\n")

    if dry_run:
        # Mostra diff simples
        old_lines = text.splitlines(keepends=True)
        new_lines = new_text.splitlines(keepends=True)
        max_n = max(len(old_lines), len(new_lines))
        diffs_shown = 0
        for i in range(max_n):
            o = old_lines[i] if i < len(old_lines) else ""
            n = new_lines[i] if i < len(new_lines) else ""
            if o != n:
                diffs_shown += 1
                if diffs_shown <= 30:
                    sys.stdout.write(f"--- L{i+1} OLD: {o.rstrip()}\n")
                    sys.stdout.write(f"+++ L{i+1} NEW: {n.rstrip()}\n")
            if diffs_shown == 31:
                sys.stdout.write(f"... (diff truncado, {changes} mudanças no total)\n")
                break
        sys.stdout.write(f"\n[DRY-RUN] {changes} linhas seriam alteradas em {in_path}\n")
        return changes

    if changes == 0:
        sys.stdout.write(f"[simplify] nenhuma mudança necessária em {in_path}\n")
        return 0

    in_path.write_text(new_text, encoding="utf-8")
    sys.stdout.write(f"[simplify] {changes} linhas alteradas em {in_path}\n")
    return changes


def main() -> None:
    p = argparse.ArgumentParser(
        description="Renomeia servidores em liveChannels.ts para 'Servidor N' posicional."
    )
    p.add_argument("--in", dest="in_path", default=DEFAULT_IN,
                   help=f"input file (default: {DEFAULT_IN})")
    p.add_argument("--dry-run", action="store_true",
                   help="só mostra o diff, não escreve no arquivo")
    args = p.parse_args()
    simplify(Path(args.in_path).resolve(), dry_run=args.dry_run)


if __name__ == "__main__":
    main()
