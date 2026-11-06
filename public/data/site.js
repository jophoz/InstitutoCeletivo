/* ==========================================================
   DADOS DO SITE — edite aqui nome, textos e contatos.
   Os PRODUTOS vêm do banco (cadastrados no painel), não daqui.
   Campos vazios ("" ou null) são simplesmente ocultados no site.
   Os textos marcados com REVISAR são sugestões: confira antes de publicar.
   ========================================================== */
window.SITE = {
  nome: "Instituto Celetivo",
  slogan: "Cursos e manuais para usar no trabalho",
  descricao:
    "Videoaulas, manuais em PDF e guias de consulta, com o conteúdo de cada um descrito antes da compra. O pagamento é feito pela Kiwify e o acesso chega por e-mail.",

  // Página Sobre (texto separado em parágrafos por linha em branco: \n\n)
  sobre: {
    subtitulo: "Cursos e materiais digitais reunidos em um só lugar.",
    titulo: "O que é o Instituto Celetivo",
    // REVISAR: prazos e regras resumidos de duvidas.html.
    texto:
      "O Instituto Celetivo reúne cursos, manuais e guias em formato digital. Cada material tem uma página com o que ele traz, quem o produziu, o formato e o preço.\n\nA compra é feita pela Kiwify, com Pix, cartão ou boleto. O acesso chega no e-mail usado no pagamento, e você tem 7 dias para pedir o reembolso se o material não for o que esperava.",
    chamada: {
      destaque: "Veja os cursos e materiais disponíveis.",
      texto: "No catálogo você busca por tema e filtra por tipo de material.",
    },
  },

  professor: {
    nome: "", // REVISAR: nome de quem ensina (vazio = a seção não aparece)
    cargo: "",
    bio: "",
    foto: null, // ex.: "assets/images/professor.webp"
    fotoAlt: "",
  },

  contato: {
    email: "celetivo.cursos@gmail.com",
    whatsapp: "", // somente dígitos com DDI/DDD, ex.: "5511999999999"
    redes: [
      { nome: "Instagram", url: "" }, // ex.: "https://instagram.com/perfil"
      { nome: "YouTube", url: "" },
      { nome: "LinkedIn", url: "" },
    ],
  },
};
