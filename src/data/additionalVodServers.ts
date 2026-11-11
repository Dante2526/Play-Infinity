// Shared by the admin chooser and POST validation: new players must be
// selectable and persistable with the exact keys used by the playback modal.
export const ADDITIONAL_VOD_SERVERS = [
  {key:'srv_saimo_hls',label:'Saimo Play HD',badge:'HLS',badgeColor:'bg-purple-500/15 text-purple-300 border-purple-500/30',description:'Qualidade adaptativa e múltiplas faixas de áudio'},
  {key:'srv_saimo_mp4',label:'Saimo Turbo',badge:'MP4',badgeColor:'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',description:'Saimo com arquivo MP4 progressivo'},
  {key:'srv_anidigital',label:'AnimesDigital',badge:'HLS',badgeColor:'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',description:'Catálogo de animes com player integrado'},
];
