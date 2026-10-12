import "server-only";

import nodemailer from "nodemailer";
import { PRODUCTION_APP_URL } from "@/lib/auth/config";

export function getSmtpConfig(): {
  host: string;
  port: number;
  user: string;
  pass: string;
} | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT?.trim() || "587");
  if (!host || !user || !pass || !Number.isInteger(port) || port <= 0) {
    return null;
  }
  return { host, port, user, pass };
}

export function getMailgunConfig(): { apiKey: string; domain: string } | null {
  const apiKey = process.env.MAILGUN_API_KEY?.trim();
  const domain = process.env.MAILGUN_DOMAIN?.trim() || "m.sonrie.ai";
  if (!apiKey) return null;
  return { apiKey, domain };
}

export function getPasswordResetWebBaseUrl(requestOrigin?: string): string {
  const configured =
    process.env.PASSWORD_RESET_WEB_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (process.env.VERCEL_ENV === "production") {
    return PRODUCTION_APP_URL;
  }

  if (requestOrigin) {
    return requestOrigin.replace(/\/+$/, "");
  }

  return "http://localhost:5001";
}

export function buildPasswordResetUrl(token: string, baseUrl: string): string {
  const url = new URL("/reset-password", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function sendPasswordResetEmail(input: {
  email: string;
  userName: string;
  resetUrl: string;
}): Promise<boolean> {
  const smtp = getSmtpConfig();
  const mailgun = getMailgunConfig();
  if (!smtp && !mailgun) return false;

  const senderName = process.env.AUTH_SENDER_NAME?.trim() || "Texoma Dashboard";
  const fromAddress =
    process.env.SENDER_EMAIL?.trim() ||
    smtp?.user ||
    `security@${mailgun?.domain}`;

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0f3140;">
      <h2 style="margin:0 0 12px;font-size:20px;">Reset your password</h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">
        Hi ${escapeHtml(input.userName)}, we received a request to reset your Texoma practice dashboard password.
      </p>
      <p style="margin:0 0 20px;">
        <a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:600;">
          Reset password
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#5a727c;">
        This link expires in 2 hours. If you did not request a reset, you can ignore this email.
      </p>
      <p style="margin:0;font-size:12px;color:#5a727c;word-break:break-all;">
        ${escapeHtml(input.resetUrl)}
      </p>
    </div>
  `.trim();

  const subject = "Reset your Texoma dashboard password";
  const from = `${senderName} <${fromAddress}>`;

  if (smtp) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        requireTLS: smtp.port !== 465,
        auth: {
          user: smtp.user,
          pass: smtp.pass,
        },
      });
      await transporter.sendMail({
        from,
        to: input.email,
        subject,
        html,
      });
      return true;
    } catch (error) {
      console.error(
        "SMTP send failed:",
        error instanceof Error ? error.message : error,
      );
      return false;
    }
  }

  if (!mailgun) return false;

  const body = new URLSearchParams({
    from,
    to: input.email,
    subject,
    html,
  });

  const response = await fetch(
    `https://api.mailgun.net/v3/${mailgun.domain}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${mailgun.apiKey}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  return response.ok;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
