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
    refresh_token: data.refresh_token || account.refresh_token
  };
}

async function fetchTikTokVideos(accessToken) {
  const fields = [
    "id",
    "create_time",
    "cover_image_url",
    "share_url",
    "video_description",
    "duration",
    "title",
    "like_count",
    "comment_count",
    "share_count",
    "view_count"
  ].join(",");

  const response = await fetch(
    `https://open.tiktokapis.com/v2/video/list/?fields=${encodeURIComponent(fields)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        max_count: 20
      })
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

    let { response, data } =
      await fetchTikTokVideos(account.access_token);

    const tokenInvalid =
      data?.error?.code === "access_token_invalid" ||
      data?.error?.code === "access_token_expired";

    if (!response.ok && tokenInvalid) {
      account = await refreshTikTokToken(
        account,
        sql
      );

      ({ response, data } =
        await fetchTikTokVideos(
          account.access_token
        ));
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Erro ao consultar vídeos do TikTok",
        details: data
      });
    }

    const videos =
      data?.data?.videos || [];

    return res.status(200).json({
      connected: true,
      count: videos.length,
      has_more: data?.data?.has_more || false,
      cursor: data?.data?.cursor || null,
      videos: videos.map((video) => ({
        id: video.id,
        title: video.title || null,
        description:
          video.video_description || null,
        create_time:
          video.create_time || null,
        cover_image_url:
          video.cover_image_url || null,
        share_url:
          video.share_url || null,
        duration:
          video.duration || null,
        view_count:
          video.view_count ?? null,
        like_count:
          video.like_count ?? null,
        comment_count:
          video.comment_count ?? null,
        share_count:
          video.share_count ?? null
      }))
    });

  } catch (error) {
    console.error(
      "TikTok videos error:",
      error
    );

    return res.status(500).json({
      error: "Erro interno",
      details: error.message
    });
  }
}
