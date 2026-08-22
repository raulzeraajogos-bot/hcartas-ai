import { neon } from "@neondatabase/serverless";

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

    const account = rows[0];

    const response = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username,bio_description,profile_deep_link,is_verified",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${account.access_token}`
        }
      }
    );

    const data = await response.json();

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
