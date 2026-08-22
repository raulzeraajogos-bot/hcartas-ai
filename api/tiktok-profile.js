import { neon } from "@neondatabase/serverless";

async function refreshTikTokToken(account, sql) {
  if (!account.refresh_token) {
    throw new Error("Refresh token não disponível");
  }

  const body = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    client_secret: process.env.TIKTOK_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: account.refresh_token
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

  if (!response.ok || !data.access_token) {
    throw new Error(
      data?.error_description ||
      data?.message ||
      "Falha ao renovar token do TikTok"
    );
  }

  await sql`
    UPDATE tiktok_accounts
    SET
      access_token = ${data.access_token},
      refresh_token = ${data.refresh_token || account.refresh_token},
      expires_in = ${data.expires_in || null},
      refresh_expires_in = ${data.refresh_expires_in || null},
      scope = ${data.scope || account.scope || null},
      updated_at = NOW()
    WHERE open_id = ${account.open_id}
  `;

  return {
    ...account,
    access_token: data.access_token,
    refresh_token: data.refresh_token || account.refresh_token,
    expires_in: data.expires_in || account.expires_in,
    refresh_expires_in:
      data.refresh_expires_in || account.refresh_expires_in,
    scope: data.scope || account.scope
  };
}

async function fetchTikTokProfile(accessToken) {
  const response = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username,bio_description,profile_deep_link,is_verified",
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  const data = await response.json();

  return {
    response,
    data
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Método não permitido"
    });
  }

  try {
    const sql = neon(process.env.DATABASE_URL);

    const rows = await sql`
      SELECT
        open_id,
        access_token,
        refresh_token,
        expires_in,
        refresh_expires_in,
        scope,
        updated_at
      FROM tiktok_accounts
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    if (!rows.length) {
      return res.status(404).json({
        connected: false,
        error: "Nenhuma conta TikTok conectada"
      });
    }

    let account = rows[0];

    // Primeira tentativa com o token atual
    let { response, data } = await fetchTikTokProfile(
      account.access_token
    );

    const tokenInvalid =
      data?.error?.code === "access_token_invalid" ||
      data?.error?.code === "access_token_expired";

    // Se expirou ou ficou inválido, renova automaticamente
    if (!response.ok && tokenInvalid) {
      account = await refreshTikTokToken(account, sql);

      ({ response, data } = await fetchTikTokProfile(
        account.access_token
      ));
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Erro ao consultar perfil do TikTok",
        details: data
      });
    }

    const user = data?.data?.user;

    if (!user) {
      return res.status(500).json({
        error: "TikTok não retornou os dados do perfil",
        details: data
      });
    }

    return res.status(200).json({
      connected: true,
      profile: {
        open_id: user.open_id,
        union_id: user.union_id || null,
        avatar_url: user.avatar_url || null,
        display_name: user.display_name || null,
        username: user.username || null,
        bio_description: user.bio_description || null,
        profile_deep_link: user.profile_deep_link || null,
        is_verified: user.is_verified || false
      }
    });

  } catch (error) {
    console.error("TikTok profile error:", error);

    return res.status(500).json({
      error: "Erro interno",
      details: error.message
    });
  }
}
