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
        scope,
        expires_in,
        refresh_expires_in,
        updated_at
      FROM tiktok_accounts
      ORDER BY updated_at DESC
      LIMIT 1
    `;

    if (!rows.length) {
      return res.status(200).json({
        connected: false
      });
    }

    const account = rows[0];

    return res.status(200).json({
      connected: true,
      account: {
        open_id: account.open_id,
        scope: account.scope,
        expires_in: account.expires_in,
        refresh_expires_in: account.refresh_expires_in,
        updated_at: account.updated_at
      }
    });

  } catch (error) {
    console.error("TikTok account error:", error);

    return res.status(500).json({
      error: "Erro ao consultar conta TikTok",
      details: error.message
    });
  }
}
