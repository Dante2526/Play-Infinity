import React from 'react';
import { ArrowLeft, Shield } from 'lucide-react';

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-black/95 text-white pt-24 pb-20 px-4">
      <div className="max-w-3xl mx-auto">
        <button 
          onClick={() => {
            window.history.back();
            // trigger custom event to navigate home if history is empty
            window.dispatchEvent(new Event('popstate'));
          }}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft size={20} />
          <span>Voltar</span>
        </button>
        
        <div className="flex items-center gap-3 mb-8">
          <Shield className="w-8 h-8 text-white" />
          <h1 className="text-3xl font-bold">Política de Privacidade</h1>
        </div>

        <div className="space-y-6 text-gray-300">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Informações que coletamos</h2>
            <p>O Play Infinity coleta apenas informações básicas necessárias para o funcionamento do aplicativo, como histórico de visualização e filmes favoritos salvos na sua conta, visando melhorar a sua experiência.</p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. Como usamos suas informações</h2>
            <p>Seus dados de histórico e favoritos são utilizados exclusivamente para sincronizar seu progresso entre dispositivos e sugerir conteúdos relevantes na interface do aplicativo.</p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. Compartilhamento de dados</h2>
            <p>Nós NÃO vendemos, alugamos ou compartilhamos suas informações pessoais com terceiros sob nenhuma circunstância. Todo conteúdo consumido trafega de forma anônima sempre que possível.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Permissões do Aplicativo</h2>
            <p>O aplicativo pode solicitar acesso à internet para exibir os vídeos e acesso ao armazenamento local (apenas para usuários do plano Plus) a fim de realizar downloads de filmes e séries offline.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Exclusão de Dados</h2>
            <p>Você pode solicitar a exclusão de todos os seus dados a qualquer momento diretamente pelo aplicativo ou entrando em contato com nosso suporte.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
