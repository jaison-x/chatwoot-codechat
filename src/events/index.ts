import mimeTypes from "mime-types";
import {
  createBotMessage,
  createConversation,
  createMessage,
  findContact,
  getInbox,
  sendData,
  updateContact,
} from "../providers/chatwoot";
import {
  getBase64FromMediaMessage,
  getConversationMessage,
  isMediaMessage,
  createInstancia,
  sendAttachment,
  sendText,
  logoutInstancia,
  statusInstancia
} from "../providers/codechat"
import { IMPORT_MESSAGES_SENT, TOSIGN } from "../config";
import { writeFileSync } from "fs";
import db from "../db";
import path from "path";

const messages_sent = [];

export const eventChatWoot = async (body: any) => {
  if (!body?.conversation || body.private) return { message: 'bot' };
  const chatId = body.conversation.meta.sender.phone_number.replace('+', '');
  const messageReceived = body.content;
  const senderName = body?.sender?.name;
  const accountId = body.account.id as number;

  console.log(`🎉 Evento recebido de ${chatId}`, body);

  if (chatId === '123456' && body.message_type === 'outgoing') {
    const command = messageReceived.replace("/", "");
    if (command === "iniciar") {

      const status = await statusInstancia(body.inbox.name)
      try {

        if (status && status.data.state === "open") {
          await createBotMessage(accountId, `🚨 Instância ${body.inbox.name} já está conectada.`, "incoming", body.inbox.name);

        } else {
          await createInstancia(body.inbox.name);
        }
      }
      catch (error) {
        await createBotMessage(accountId, `🚨 Instância ${body.inbox.name} não foi criada.`, "incoming", body.inbox.name);
      }

    }

    if (command === "status") {
      console.log(`Status da instância ${body.inbox.name}: `)

      const status = await statusInstancia(body.inbox.name);

      if (!status) {
        await createBotMessage(accountId, `⚠️ Instância ${body.inbox.name} não existe.`, "incoming", body.inbox.name);
      }

      if (status) {
        await createBotMessage(accountId, `⚠️ Status da instância ${body.inbox.name}: *${status.data.state}*`, "incoming", body.inbox.name);
      }

    }

    if (command === "desconectar") {
      console.log(`Desconectando Whatsapp ${body.inbox.name}: `)
      const msgLogout = `🚨 Desconectando Whatsapp da caixa de entrada *${body.inbox.name}*: `;
      await createBotMessage(accountId, msgLogout, "incoming", body.inbox.name);
      await logoutInstancia(body.inbox.name);
    }
  }

  if (body.message_type === 'outgoing' && body?.conversation?.messages?.length && chatId !== '123456') {
    if (IMPORT_MESSAGES_SENT && messages_sent.includes(body.id)) {
      console.log(`🚨 Não importar mensagens enviadas, ficaria duplicado.`);

      const indexMessage = messages_sent.indexOf(body.id);
      messages_sent.splice(indexMessage, 1);

      return { message: 'bot' };
    }

    let formatText: string;
    if (senderName === null || senderName === undefined) {
      formatText = messageReceived;
    } else {
      formatText = TOSIGN ? `*${senderName}*: ${messageReceived}` : messageReceived;
    }

    for (const message of body.conversation.messages) {

      if (message.attachments && message.attachments.length > 0) {

        for (const attachment of message.attachments) {
          console.log(attachment)
          sendAttachment(
            chatId,
            attachment.data_url,
            body.inbox.name,
            formatText
          );
        }
      } else {
        sendText(formatText, chatId, body.inbox.name);
      }
    }
  }

  return { message: 'bot' };
}

export const eventCodeChat = async (body: any) => {
  try {
    const instance = body.instance;
    console.log(`🎉 Evento recebido de ${instance}`, body);


    const stmtExist = db.prepare(`SELECT * FROM providers WHERE nameInbox = ?`);
    const instanceDb = stmtExist.get(instance) as any;

    if (!instanceDb) {
      console.log(`🚨 Erro ao buscar instância.`);
      return;
    }

    const accountId = instanceDb.account_id;

    if (body.event === "messages.upsert") {
      if (body.data.key.fromMe && !IMPORT_MESSAGES_SENT) {
        return;
      }

      if (body.data.key.remoteJid === 'status@broadcast') {
        console.log(`🚨 Ignorando status do whatsapp.`);
        return;
      }

      const getConversion = await createConversation(body, accountId);
      const messageType = body.data.key.fromMe ? 'outgoing' : 'incoming';

      if (!getConversion) {
        console.log("🚨 Erro ao criar conversa");
        return;
      }

      const isMedia = isMediaMessage(body.data.message);
      const bodyMessage = getConversationMessage(body.data.message);

      if (isMedia) {
        const downloadBase64 = await getBase64FromMediaMessage(
          body.data,
          instance
        );

        const random = Math.random().toString(36).substring(7);
        const nameFile = `${random}.${mimeTypes.extension(
          downloadBase64.data.mimetype
        )}`;

        const fileData = Buffer.from(downloadBase64.data.base64, 'base64');

        writeFileSync(`${path.join(__dirname, '../../uploads')}/${nameFile}`, fileData, 'utf8');

        return await sendData(
          accountId,
          getConversion,
          `${path.join(__dirname, '../../uploads')}/${nameFile}`,
          messageType,
          bodyMessage
        );
      } else {
        return await createMessage(accountId, getConversion, bodyMessage, messageType);
      }

    }

    if (body.event === "status.instance") {
      const { data } = body;
      const inbox = await getInbox(instance, accountId);
      const msgStatus = `⚡️ Status da instância ${inbox.name}: ${data.status}`;
      await createBotMessage(accountId, msgStatus, "incoming", instance);
    }

    if (body.event === "connection.update") {
      console.log("connection.update");

      if (body.data.state === "open") {
        const msgConnection = `🚀 Conexão realizada com sucesso!`;
        await createBotMessage(accountId, msgConnection, "incoming", instance);
      }
    }

    if (body.event === "contacts.update") {
      const { data } = body;

      if (data.length) {
        for (const item of data) {
          const number = item.id.split("@")[0];
          const photo = item.profilePictureUrl || null;
          const find = await findContact(number, accountId);

          if (find) {
            await updateContact(find.id, {
              avatar_url: photo,
            },
              accountId
            );
          }
        }
      }
    }
  } catch (error) {
    console.log(error);
  }
};

