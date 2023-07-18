import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST;
const port = process.env.SMTP_PORT;
const secure = process.env.SMTP_IS_SECURE === "true";
const user = process.env.SMTP_USER;
const password = process.env.SMTP_PASSWORD;

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: {
    user,
    pass: password,
  }
});

export async function sendMailInstanceClose(instance: string, statusReason: number) {
  const disconnectReason = {
    428: "connectionClosed",
    408: "connectionLost",
    440: "connectionReplaced",
    401: "loggedOut",
    500: "badSession",
    515: "restartRequired",
    411: "multideviceMismatch",
  }
  const descriptionReason = disconnectReason[statusReason] || "Não especificado";

  const mailTo = process.env.MAIL_NOTIFICATIONS;
  const mailFrom = process.env.MAIL_FROM;
  const subject = `Instância ${instance} desconectada. Motivo: ${statusReason} (${descriptionReason}).`;
  const message = subject;
  
  if (mailTo && mailFrom)  {
    sendMail(mailFrom, mailTo, subject, message);
  }
}

export async function sendMail(from: string, to: string, subject: string, html: string) {
  if (!host || !port || !user || !port ) {
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
    });

    return info.messageId;
  } catch (error) {
    console.log(error);
    return false;
  }
}