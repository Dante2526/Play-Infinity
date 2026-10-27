import React from 'react';
import { ArrowLeft, Shield } from 'lucide-react';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pt-24 pb-20 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <button 
          type="button"
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              window.location.href = '/';
            }
            try {
              window.dispatchEvent(new PopStateEvent('popstate', { state: { type: 'home' } }));
            } catch {
              window.dispatchEvent(new Event('popstate'));
            }
          }}
          className="min-h-[44px] px-4 py-2.5 rounded-full bg-white/5 hover:bg-orange-600 border border-white/10 hover:border-orange-500 text-gray-300 hover:text-white transition-all mb-8 flex items-center gap-2 text-sm font-semibold cursor-pointer active:scale-95"
        >
          <ArrowLeft size={18} />
          <span>Voltar para o Início</span>
        </button>
        
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 bg-orange-500/10 border border-orange-500/20 rounded-2xl">
            <Shield className="w-7 h-7 text-orange-500" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">Política de Privacidade</h1>
        </div>
        <p className="text-xs text-neutral-400 mb-8 pb-4 border-b border-white/10">
          Última atualização: 27 de Outubro de 2026 • Documento Oficial Aberto ao Público
        </p>

        <div className="space-y-6 text-neutral-300 text-sm sm:text-base leading-relaxed">
          <section className="bg-white/5 border border-white/5 rounded-2xl p-5 sm:p-6 shadow-md">
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-orange-500 rounded-full inline-block"></span>
              1. Identificação e Compromisso
            </h2>
            <p className="text-neutral-400">
              A plataforma e aplicativo <strong>Play Infinity</strong> tem como compromisso prioritário a segurança, a privacidade e a transparência em relação aos dados dos seus usuários, operando em conformidade com as diretrizes do Google Play e legislações aplicáveis de proteção de dados (LGPD).
            </p>
          </section>
          
          <section className="bg-white/5 border border-white/5 rounded-2xl p-5 sm:p-6 shadow-md">
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-orange-500 rounded-full inline-block"></span>
              2. Informações que Coletamos
            </h2>
            <p className="text-neutral-400 mb-2">Coletamos apenas os dados essenciais para o funcionamento do serviço e autenticação do assinante:</p>
            <ul className="list-disc pl-5 space-y-1 text-neutral-400 text-sm">
              <li><strong>Dados de Conta:</strong> Nome ou apelido de exibição, e-mail cadastrado e credencial de acesso.</li>
              <li><strong>Preferências e Progresso:</strong> Lista de títulos favoritados, episódios marcados como assistidos e ponto exato de reprodução (Continue Assistindo).</li>
              <li><strong>Dados Técnicos Não-Sensíveis:</strong> Tipo de aparelho e registros transitórios de conectividade HLS estritamente necessários para o streaming.</li>
            </ul>
          </section>
          
          <section className="bg-white/5 border border-white/5 rounded-2xl p-5 sm:p-6 shadow-md">
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-orange-500 rounded-full inline-block"></span>
              3. Finalidade do Uso das Informações
            </h2>
            <p className="text-neutral-400">
              Seus dados de histórico e favoritos são utilizados exclusivamente para sincronizar seu progresso entre dispositivos, verificar a validade da assinatura ativa e garantir a estabilidade do reprodutor.
            </p>
          </section>

          <section className="bg-white/5 border border-white/5 rounded-2xl p-5 sm:p-6 shadow-md">
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-orange-500 rounded-full inline-block"></span>
              4. Não Compartilhamento com Terceiros
            </h2>
            <p className="text-neutral-400">
              <strong>Nós NÃO vendemos, alugamos, comercializamos nem compartilhamos</strong> quaisquer dados pessoais de nossos usuários com empresas de publicidade ou corretores de dados. Todo o tráfego transita por conexões criptografadas HTTPS/TLS.
            </p>
          </section>

          <section className="bg-white/5 border border-white/5 rounded-2xl p-5 sm:p-6 shadow-md">
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-orange-500 rounded-full inline-block"></span>
              5. Permissões do Aplicativo
            </h2>
            <p className="text-neutral-400">
              O aplicativo solicita acesso à Internet para conexão de streaming e acesso ao armazenamento local para salvar preferências offline e downloads autorizados de assinantes Plus.
            </p>
          </section>

          <section className="bg-white/5 border border-white/5 rounded-2xl p-5 sm:p-6 shadow-md">
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-orange-500 rounded-full inline-block"></span>
              6. Retenção e Exclusão Total de Dados
            </h2>
            <p className="text-neutral-400 mb-2">
              Você tem o direito de solicitar a exclusão total e definitiva de sua conta e dados a qualquer momento pelo app ou através do nosso canal oficial de privacidade:
            </p>
            <p className="font-semibold text-orange-400">
              E-mail: suporte@play-infinity.stream
            </p>
          </section>

          <section className="bg-white/5 border border-white/5 rounded-2xl p-5 sm:p-6 shadow-md">
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-orange-500 rounded-full inline-block"></span>
              7. Segurança da Informação
            </h2>
            <p className="text-neutral-400">
              Adotamos criptografia de senhas, conexões seguras HTTPS/TLS em todos os endpoints e regras restritivas de acesso no banco de dados em nuvem (Firestore Security Rules).
            </p>
          </section>

          <section className="bg-white/5 border border-white/5 rounded-2xl p-5 sm:p-6 shadow-md">
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4 bg-orange-500 rounded-full inline-block"></span>
              8. Contato e Suporte
            </h2>
            <p className="text-neutral-400">
              Caso tenha dúvidas sobre esta política, contate nossa equipe pelo e-mail <strong>suporte@play-infinity.stream</strong> ou através do site oficial <strong>https://play-infinity.stream</strong>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
