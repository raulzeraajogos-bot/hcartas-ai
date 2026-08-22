export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido"
    });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY não configurada na Vercel"
      });
    }

    const {
      tipo,
      tema,
      detalhes,
      duracao
    } = req.body || {};

    if (!tema || !tema.trim()) {
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
- manter boa retenção;
- terminar com uma conclusão ou chamada para interação;
- não inventar fatos apresentados como verdade quando o tema exigir informação factual.

Entregue exatamente neste formato:

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

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },

        body: JSON.stringify({
          model: "gpt-5.6-luna",
          input: prompt
        })
      }
    );

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      console.error(
        "Erro OpenAI:",
        JSON.stringify(data)
      );

      return res.status(openaiResponse.status).json({
        error: "Erro retornado pela OpenAI",
        details:
          data?.error?.message ||
          "Erro desconhecido da OpenAI"
      });
    }

    /*
      A Responses API devolve o texto dentro
      da estrutura output -> message -> content.
    */

    let roteiro = "";

    if (Array.isArray(data.output)) {
      for (const item of data.output) {

        if (
          item.type === "message" &&
          Array.isArray(item.content)
        ) {

          for (const content of item.content) {

            if (
              content.type === "output_text" &&
              content.text
            ) {
              roteiro += content.text;
            }
          }
        }
      }
    }

    if (!roteiro.trim()) {
      console.error(
        "Resposta OpenAI sem texto:",
        JSON.stringify(data)
      );

      return res.status(500).json({
        error: "A IA não retornou um roteiro"
      });
    }

    return res.status(200).json({
      success: true,
      roteiro: roteiro.trim()
    });

  } catch (error) {

    console.error(
      "Erro ao gerar roteiro:",
      error
    );

    return res.status(500).json({
      error: "Erro interno ao gerar roteiro",
      details:
        error?.message ||
        "Erro desconhecido"
    });
  }
}
