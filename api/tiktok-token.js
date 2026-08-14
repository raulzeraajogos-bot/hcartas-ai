export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido"
    });
  }

  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        error: "Código de autorização ausente"
      });
    }

    const body = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      code: code,
      grant_type: "authorization_code",
      redirect_uri: "https://hcartas-ai.vercel.app/auth/callback/"
    });

    const response = await fetch(
      "https://open.tiktokapis.com/v2/oauth/token/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Erro ao obter token do TikTok",
        details: data
      });
    }

    return res.status(200).json({
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      open_id: data.open_id,
      scope: data.scope,
      expires_in: data.expires_in,
      refresh_expires_in: data.refresh_expires_in
    });

  } catch (error) {
    return res.status(500).json({
      error: "Erro interno",
      details: error.message
    });
  }
}
