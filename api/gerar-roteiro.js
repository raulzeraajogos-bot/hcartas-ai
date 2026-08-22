import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido"
    });
  }

  try {
    const {
      tipo,
      tema,
      detalhes,
      duracao
    } = req.body || {};

    if (!tema) {
      return res.status(400).json({
        error: "Tema do vídeo é obrigatório"
      });
    }

    const prompt = `
Você é um roteirista especializado em vídeos curtos para TikTok.

Crie um roteiro em português do Brasil.

Tipo de conteúdo: ${tipo || "vídeo"}
Tema: ${tema}
Detalhes adicionais: ${detalhes || "Nenhum"}
Duração aproximada: ${duracao || 60} segundos

O roteiro deve:
- começar com um gancho forte nos primeiros segundos;
- manter ritmo rápido e linguagem natural;
- ser adequado para narração;
- evitar enrolação;
- terminar com uma conclusão ou chamada que incentive retenção/interação;
- não inventar fatos apresentados como verdade quando o tema exigir informação factual.

Entregue neste formato:

TÍTULO:
...

GANCHO:
...

ROTEIRO:
...

TEXTO NA TELA:
...

LEGENDA:
...

HASHTAGS:
...
    `.trim();

    const response = await client.responses.create({
      model: "gpt-5.6-luna",
      input: prompt
    });

    const roteiro = response.output_text;

    if (!roteiro) {
      return res.status(500).json({
        error: "A IA não retornou um roteiro"
      });
    }

    return res.status(200).json({
      success: true,
      roteiro
    });

  } catch (error) {
    console.error("Erro ao gerar roteiro:", error);

    return res.status(500).json({
      error: "Erro ao gerar roteiro",
      details: error.message
    });
  }
}
