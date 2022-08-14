import axios from 'axios';

const BASE_URL = 'https://api.telegram.org/bot'
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;



async function call(method: string, data: any, timeout = 10000): Promise<any> {
  try {
    const result = await axios.post(`${BASE_URL}${TOKEN}/${method}`, data, {
      timeout, headers: {
        'Content-Type': 'application/json'
      }
    });
    if (result.status === 200) return result.data
  } catch (error) {
    console.error(error)
  }
  return null;
}

export async function sendMessage(chatId: string, text: string, replyMarkup:any = undefined, parseMode = 'HTML',
  disableNotification = true): Promise<any> {
  const message = {
    'chat_id': chatId,
    'text': text,
    'parse_mode': parseMode,
    'disable_notification': disableNotification,
    reply_markup: replyMarkup
  }

  return call('sendMessage', message)
}


export async function sendPhoto(chatId: string, photo: any, text = '', replyMarkup:any = undefined, parseMode = 'HTML',
  disableNotification = true): Promise<any> {
  const message = {
    'chat_id': chatId,
    photo,
    'caption': text,
    'parse_mode': parseMode,
    'disable_notification': disableNotification,
    reply_markup: replyMarkup
  }

  return call('sendPhoto', message, 30000)
}

export async function sendVideo(chatId: string, video: any, text = '', replyMarkup:any = undefined, parseMode = 'HTML',
  disableNotification = true): Promise<any> {
  const message = {
    'chat_id': chatId,
    video,
    'caption': text,
    'parse_mode': parseMode,
    'disable_notification': disableNotification,
    reply_markup: replyMarkup
  }

  return call('sendVideo', message, 30000)
}

export async function sendMediaGroup(chatId: string, photos: any[], text = '', replyMarkup:any = undefined, parseMode = 'HTML',
  disableNotification = true): Promise<any> {
  const media = photos.map(photo => ({ 'type': 'photo', 'media': photo, 'caption': text, 'parse_mode': parseMode }))
  const message = {
    'chat_id': chatId,
    media,
    'disable_notification': disableNotification,
    reply_markup: replyMarkup
  }

  return call('sendMediaGroup', message, 30000)
}