import { neon } from "@neondatabase/serverless";

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
      code,
      grant_type: "authorization_code",
      redirect_uri: "https://hcartas-ai.vercel.app/auth/callback/"
    });

    // Troca o código de autorização pelos tokens do TikTok
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

    if (!data.access_token) {
      return res.status(500).json({
        error: "TikTok não retornou o access_token",
        details: data
      });
    }

    // Algumas respostas de token podem não trazer open_id.
    // Nesse caso, buscamos o open_id usando o access_token.
    let openId = data.open_id;

    if (!openId) {
      const userResponse = await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${data.access_token}`
          }
        }
      );

      const userData = await userResponse.json();

      openId = userData?.data?.user?.open_id;

      if (!openId) {
        return res.status(500).json({
          error: "Não foi possível obter o open_id da conta TikTok",
          details: userData
        });
      }
    }

    // Conecta ao banco Neon
    const sql = neon(process.env.DATABASE_URL);

    // Salva a conta TikTok.
    // Se ela já existir, atualiza os tokens.
    await sql`
      INSERT INTO tiktok_accounts (
        open_id,
        access_token,
        refresh_token,
        expires_in,
        refresh_expires_in,
        scope,
        updated_at
      )
      VALUES (
        ${openId},
        ${data.access_token},
        ${data.refresh_token || null},
        ${data.expires_in || null},
        ${data.refresh_expires_in || null},
        ${data.scope || null},
        NOW()
      )
      ON CONFLICT (open_id)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_in = EXCLUDED.expires_in,
        refresh_expires_in = EXCLUDED.refresh_expires_in,
        scope = EXCLUDED.scope,
        updated_at = NOW()
    `;

    // Não enviamos access_token ou refresh_token ao navegador.
    return res.status(200).json({
      success: true,
      connected: true,
      open_id: openId
    });

  } catch (error) {
    console.error("TikTok token error:", error);

    return res.status(500).json({
      error: "Erro interno",
      details: error.message
    });
  }
}
