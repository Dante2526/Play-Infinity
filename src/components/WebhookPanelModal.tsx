import React, { useState, useEffect } from "react";
import { X, Copy, Check, Terminal, Radio, Play, Plus, RefreshCw } from "lucide-react";

interface WebhookPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPlayItem?: (title: string, playerUrl: string) => void;
}

export function WebhookPanelModal({ isOpen, onClose, onPlayItem }: WebhookPanelModalProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Form for testing adding an episode manually
  const [testTitle, setTestTitle] = useState("Mayday (Dublado)");
  const [testUrl, setTestUrl] = useState("https://encontrei.info/filmes/online/mayday-dublado-79329/");
  const [testSeason, setTestSeason] = useState("1");
  const [testEpisode, setTestEpisode] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/custom-episodes");
      const data = await res.json();
      if (data.success) {
        setItems(data.items);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchItems();
    }
  }, [isOpen]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleTestPost = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitSuccess(false);

    try {
      const res = await fetch("/api/novo-episodio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: testTitle,
          season: Number(testSeason),
          episode: Number(testEpisode),
          playerUrl: testUrl,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSubmitSuccess(true);
        fetchItems();
        setTimeout(() => setSubmitSuccess(false), 3000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const endpointUrl = typeof window !== "undefined" ? `${window.location.origin}/api/novo-episodio` : "/api/novo-episodio";
  const curlExample = `curl -X POST ${endpointUrl} \\
  -H "Content-Type: application/json" \\
  -d '{
    "title": "Mayday Dublado",
    "season": 1,
    "episode": 1,
    "playerUrl": "https://encontrei.info/filmes/online/mayday-dublado-79329/"
  }'`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="relative w-full max-w-4xl bg-[#111111] border border-neutral-800 rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-800 bg-[#161616]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-600/20 text-orange-500 border border-orange-500/30 flex items-center justify-center">
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">Integração por Endpoint / Webhook</h2>
              <p className="text-xs text-neutral-400">Receba episódios automaticamente quando postados em outro site</p>
            </div>
          </div>

          <button onClick={onClose} className="p-2 text-neutral-400 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-neutral-300 text-sm">
          {/* Endpoint box */}
          <div className="bg-[#181818] border border-neutral-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-orange-500 uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" /> Seu Endpoint de Recebimento
              </span>
              <span className="px-2 py-0.5 bg-green-500/10 text-green-400 text-[11px] font-bold rounded border border-green-500/20">
                POST Ativo
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 bg-[#0c0c0c] border border-neutral-800 rounded-xl px-4 py-2.5 font-mono text-xs text-white">
              <span className="truncate">{endpointUrl}</span>
              <button
                onClick={() => copyToClipboard(endpointUrl, "url")}
                className="shrink-0 flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 font-sans font-medium"
              >
                {copied === "url" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === "url" ? "Copiado!" : "Copiar"}
              </button>
            </div>

            <p className="text-xs text-neutral-400">
              Configure o outro site ou servidor para disparar uma requisição <strong>POST</strong> para esta URL assim que um novo vídeo for publicado.
            </p>
          </div>

          {/* cURL Example */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Exemplo de Envio JSON</span>
              <button
                onClick={() => copyToClipboard(curlExample, "curl")}
                className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1 font-medium"
              >
                {copied === "curl" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                Copiar cURL
              </button>
            </div>
            <pre className="bg-[#0c0c0c] border border-neutral-800 rounded-xl p-4 font-mono text-xs text-neutral-300 overflow-x-auto">
              {curlExample}
            </pre>
          </div>

          {/* Test simulator */}
          <div className="bg-[#181818] border border-neutral-800 rounded-2xl p-5 space-y-4">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <Plus className="w-4 h-4 text-orange-500" /> Simular Recebimento Instantâneo
            </h3>

            <form onSubmit={handleTestPost} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">Título do Filme / Série</label>
                  <input
                    type="text"
                    value={testTitle}
                    onChange={(e) => setTestTitle(e.target.value)}
                    className="w-full bg-[#0d0d0d] border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">URL da Página ou Iframe</label>
                  <input
                    type="text"
                    value={testUrl}
                    onChange={(e) => setTestUrl(e.target.value)}
                    className="w-full bg-[#0d0d0d] border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all flex items-center gap-2"
                >
                  {isSubmitting ? "Enviando..." : "Testar Envio do Episódio"}
                </button>
                {submitSuccess && (
                  <span className="text-xs text-green-400 font-medium flex items-center gap-1">
                    <Check className="w-4 h-4" /> Episódio recebido e publicado!
                  </span>
                )}
              </div>
            </form>
          </div>

          {/* Received items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-sm">Episódios Recebidos no Servidor ({items.length})</h3>
              <button onClick={fetchItems} className="text-xs text-neutral-400 hover:text-white flex items-center gap-1">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
              </button>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-neutral-800 rounded-2xl text-neutral-500 text-xs">
                Nenhum episódio recebido ainda. Use o formulário acima para testar ou envie via POST pelo outro servidor!
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between bg-[#141414] border border-neutral-800 rounded-xl p-3 text-xs hover:border-neutral-700 transition-colors"
                  >
                    <div>
                      <div className="font-bold text-white text-sm">{item.title}</div>
                      <div className="text-neutral-500 font-mono text-[11px] truncate max-w-md">
                        {item.season ? `T${item.season}E${item.episode} • ` : ""}
                        {item.playerUrl}
                      </div>
                    </div>
                    {onPlayItem && (
                      <button
                        onClick={() => {
                          onPlayItem(item.title, item.playerUrl);
                          onClose();
                        }}
                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <Play className="w-3 h-3 fill-current" /> Assistir
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
