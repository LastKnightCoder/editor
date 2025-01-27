import crypto from 'crypto';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import axios, { AxiosResponse, Method } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { ipcMain } from 'electron';
import { Module } from '../types/module';

dayjs.extend(utc);

const SERVICE = 'speech_saas_prod';
const VERSION = '2023-11-07';
const REGION = 'cn-north-1';
const ACTION = 'ListMegaTTSTrainStatus';

const HOST = 'open.volcengineapi.com';
const SPEECH_HOST = 'openspeech.bytedance.com';

const CONTENT_TYPE = 'application/json; charset=utf-8';

interface AudioInfo {
  audio_bytes: string;
  audio_format: string;
}

interface TrainSpeakerBody {
  appid: string;
  speaker_id: string;
  audios: AudioInfo[];
  source: number;
  language: number;
  model_type: number;
  cluster: string;
}



interface TTSApp {
  appid: string;
  token: string;
  cluster: string;
}

interface TTSUser {
  uid: string;
}

interface TTSAudio {
  voice_type: string;
  encoding: string;
}

interface TTSRequest {
  text: string;
  reqid: string;
  operation: string;
}

interface TTSBody {
  app: TTSApp;
  user: TTSUser;
  audio: TTSAudio;
  request: TTSRequest;
}

function hmacSha256(key: Buffer | string, content: string): Buffer {
  return crypto.createHmac('sha256', key).update(content).digest();
}

function hashSha256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function normQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map(key => {
      const encodedKey = encodeURIComponent(key).replace('+', '%20');
      const encodedValue = encodeURIComponent(params[key]).replace('+', '%20');
      return `${encodedKey}=${encodedValue}`;
    })
    .join('&');
}

async function signRequest(
  accessToken: string,
  secretKey: string,
  method: Method,
  date: dayjs.Dayjs,
  query: Record<string, string>,
  header: Record<string, string>,
  body: string
): Promise<string> {
  const xDate = date.utc().format('YYYYMMDDTHHmmss[Z]');
  const shortXDate = xDate.slice(0, 8);
  const xContentSha256 = hashSha256(body);

  const signResult: Record<string, string> = {
    Host: HOST,
    'X-Content-Sha256': xContentSha256,
    'X-Date': xDate,
    'Content-Type': CONTENT_TYPE,
  };

  const sign = [
    `content-type:${CONTENT_TYPE}`,
    `host:${HOST}`,
    `x-content-sha256:${xContentSha256}`,
    `x-date:${xDate}`,
  ].join('\n');

  const signedHeadersStr = 'content-type;host;x-content-sha256;x-date';
  const canonicalRequestStr = [
    method.toUpperCase(),
    '/',
    normQuery(query),
    sign,
    "",
    signedHeadersStr,
    xContentSha256,
  ].join('\n');

  const hashedCanonicalRequest = hashSha256(canonicalRequestStr);
  const credentialScope = `${shortXDate}/${REGION}/${SERVICE}/request`;
  const stringToSign = [
    'HMAC-SHA256',
    xDate,
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n');

  console.log('stringToSign', stringToSign);

  let key: string | Buffer = secretKey;
  for (const msg of [shortXDate, REGION, SERVICE, 'request']) {
    key = hmacSha256(key, msg);
  }
  const signature = hmacSha256(key, stringToSign).toString('hex');

  signResult.Authorization = `HMAC-SHA256 Credential=${accessToken}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

  const finalHeader = { ...header, ...signResult };

  console.log('finalHeader', finalHeader);

  try {
    const response: AxiosResponse = await axios({
      method,
      url: `https://${HOST}/`,
      headers: finalHeader,
      params: query,
      data: body,
    });
    return response.data;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

class VoiceCopy implements Module {
  name: string;
  constructor() {
    this.name = 'voice-copy';
  }

  async init() {
    ipcMain.handle('get-all-speaker-list', async (_event, accessToken, secretKey, appid) => {
      return await this.getAllSpeakerList(accessToken, secretKey, appid);
    });

    ipcMain.handle('train-speaker', async (_, appid, token, sperkerId, audio) => {
      return await this.trainSpeaker(appid, token, sperkerId, audio);
    });

    ipcMain.handle('text-to-speech', (_, appid, token, text, speakerId) => {
      return this.textToSpeech(appid, token, text, speakerId);
    })
  }

  async getAllSpeakerList(
    accessToken: string,
    secretKey: string,
    appid: string
  ): Promise<string> {
    const method: Method = 'POST';
    const date = dayjs();

    const queryParams: Record<string, string> = {
      Action: ACTION,
      Version: VERSION,
      Region: REGION,
    };

    const body = JSON.stringify({ appid });

    return await signRequest(accessToken, secretKey, method, date, queryParams, {}, body);
  }

  async trainSpeaker(
    appid: string,
    token: string,
    speakerId: string,
    audio: string
  ): Promise<string> {
    const path = 'api/v1/mega_tts/audio/upload';
    const authorization = `Bearer;${token}`;

    const headers = {
      Authorization: authorization,
      'Resource-Id': 'volc.megatts.voiceclone',
      'Content-Type': 'application/json',
    };

    const body: TrainSpeakerBody = {
      appid,
      speaker_id: speakerId,
      audios: [{ audio_bytes: audio, audio_format: 'mp3' }],
      source: 2,
      language: 0,
      model_type: 1,
      cluster: 'volcano_icl',
    };

    const response: AxiosResponse = await axios.post(`https://${SPEECH_HOST}/${path}`, body, { headers });
    return response.data;
  }

  async textToSpeech(
    appid: string,
    token: string,
    text: string,
    speakerId: string
  ): Promise<string> {
    const path = 'api/v1/tts';
    const authorization = `Bearer;${token}`;

    const headers = {
      Authorization: authorization,
    };

    const uuid = uuidv4();
    const body: TTSBody = {
      app: {
        appid,
        token,
        cluster: 'volcano_icl',
      },
      user: {
        uid: uuid,
      },
      audio: {
        voice_type: speakerId,
        encoding: 'mp3',
      },
      request: {
        text,
        reqid: uuid,
        operation: 'query',
      },
    };

    const response: AxiosResponse = await axios.post(`https://${SPEECH_HOST}/${path}`, body, { headers });
    return response.data.data;
  }
}

export default new VoiceCopy();
