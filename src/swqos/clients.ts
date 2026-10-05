/**
 * SWQOS Clients for Sol Trade SDK
 * Implements various SWQOS (Solana Write Queue Operating System) providers.
 */

import {
  AstralaneTransport,
  SwqosTransport,
  SwqosType,
  SwqosRegion,
  TradeType,
  isSwqosTypeBlacklisted,
} from '../index';
import { TradeError } from '../sdk-errors';
import bs58 from 'bs58';
import * as grpc from '@grpc/grpc-js';
import protobuf from 'protobufjs/minimal.js';
const { Reader, Writer } = protobuf;

// ===== Utility =====

export function randomChoice<T>(arr: T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (item === undefined) {
    throw new Error('randomChoice called with empty array');
  }
  return item;
}

function appendQuery(url: string, params: Record<string, string | boolean | undefined>): string {
  const [base, query = ''] = url.split('?');
  const search = new URLSearchParams(query);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base!;
}

async function parseBodyAsJsonOrText(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractSubmitSignature(
  result: unknown,
  fallbackSignature?: string,
  allowFallback = false,
): string {
  if (typeof result === 'string') {
    const signature = result.trim();
    if (signature) return signature;
    if (allowFallback && fallbackSignature) return fallbackSignature;
    throw new TradeError(500, 'missing transaction signature in submit response');
  }
  if (Array.isArray(result) && result.length > 0) {
    return extractSubmitSignature(result[0], fallbackSignature, allowFallback);
  }
  if (result && typeof result === 'object') {
    const obj = result as Record<string, any>;
    if (obj.error) {
      throw new TradeError(obj.error.code || 500, obj.error.message || String(obj.error));
    }
    if (typeof obj.signature === 'string' && obj.signature) return obj.signature;
    if (typeof obj.result === 'string' && obj.result) return obj.result;
    if (obj.result) return extractSubmitSignature(obj.result, fallbackSignature, allowFallback);
    if (obj.success === true && fallbackSignature) return fallbackSignature;
  }
  if (allowFallback && fallbackSignature) return fallbackSignature;
  throw new TradeError(500, 'missing transaction signature in submit response');
}

// ===== Constants =====

export const MIN_TIP_JITO = 0.00001;
export const MIN_TIP_BLOXROUTE = 0.0001;
export const MIN_TIP_ZERO_SLOT = 0.0001;
export const MIN_TIP_TEMPORAL = 0.0001;
export const MIN_TIP_FLASH_BLOCK = 0.0001;
export const MIN_TIP_BLOCK_RAZOR = 0.0001;
export const MIN_TIP_NODE1 = 0.0001;
export const MIN_TIP_ASTRALANE = 0.00001;
export const MIN_TIP_HELIUS = 0.000005;        // swqos_only
export const MIN_TIP_HELIUS_NORMAL = 0.0002;   // 普通模式
export const MIN_TIP_STELLIUM = 0.0001;
export const MIN_TIP_LIGHTSPEED = 0.0001;
export const MIN_TIP_NEXT_BLOCK = 0.001;
export const MIN_TIP_SOYAS = 0.001;
export const MIN_TIP_SPEEDLANDING = 0.001;
export const MIN_TIP_SOLAMI = 0.0001;
export const MIN_TIP_LUNARLANDER = 0.001;
export const MIN_TIP_GLAIVE = 0.0001;
export const MIN_TIP_DEFAULT = 0.00001;

// ===== Tip Accounts =====

const JITO_TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
];

const ZERO_SLOT_TIP_ACCOUNTS = [
  'Eb2KpSC8uMt9GmzyAEm5Eb1AAAgTjRaXWFjKyFXHZxF3',
  'FCjUJZ1qozm1e8romw216qyfQMaaWKxWsuySnumVCCNe',
  'ENxTEjSQ1YabmUpXAdCgevnHQ9MHdLv8tzFiuiYJqa13',
  '6rYLG55Q9RpsPGvqdPNJs4z5WTxJVatMB8zV3WJhs5EK',
  'Cix2bHfqPcKcM233mzxbLk14kSggUUiz2A87fJtGivXr',
];

const TEMPORAL_TIP_ACCOUNTS = [
  'TEMPaMeCRFAS9EKF53Jd6KpHxgL47uWLcpFArU1Fanq',
  'noz3jAjPiHuBPqiSPkkugaJDkJscPuRhYnSpbi8UvC4',
  'noz3str9KXfpKknefHji8L1mPgimezaiUyCHYMDv1GE',
  'noz6uoYCDijhu1V7cutCpwxNiSovEwLdRHPwmgCGDNo',
  'noz9EPNcT7WH6Sou3sr3GGjHQYVkN3DNirpbvDkv9YJ',
  'nozc5yT15LazbLTFVZzoNZCwjh3yUtW86LoUyqsBu4L',
  'nozFrhfnNGoyqwVuwPAW4aaGqempx4PU6g6D9CJMv7Z',
  'nozievPk7HyK1Rqy1MPJwVQ7qQg2QoJGyP71oeDwbsu',
  'noznbgwYnBLDHu8wcQVCEw6kDrXkPdKkydGJGNXGvL7',
  'nozNVWs5N8mgzuD3qigrCG2UoKxZttxzZ85pvAQVrbP',
  'nozpEGbwx4BcGp6pvEdAh1JoC2CQGZdU6HbNP1v2p6P',
  'nozrhjhkCr3zXT3BiT4WCodYCUFeQvcdUkM7MqhKqge',
  'nozrwQtWhEdrA6W8dkbt9gnUaMs52PdAv5byipnadq3',
  'nozUacTVWub3cL4mJmGCYjKZTnE9RbdY5AP46iQgbPJ',
  'nozWCyTPppJjRuw2fpzDhhWbW355fzosWSzrrMYB1Qk',
  'nozWNju6dY353eMkMqURqwQEoM3SFgEKC6psLCSfUne',
  'nozxNBgWohjR75vdspfxR5H9ceC7XXH99xpxhVGt3Bb',
];

const FLASH_BLOCK_TIP_ACCOUNTS = [
  'FLaShB3iXXTWE1vu9wQsChUKq3HFtpMAhb8kAh1pf1wi',
  'FLashhsorBmM9dLpuq6qATawcpqk1Y2aqaZfkd48iT3W',
  'FLaSHJNm5dWYzEgnHJWWJP5ccu128Mu61NJLxUf7mUXU',
  'FLaSHR4Vv7sttd6TyDF4yR1bJyAxRwWKbohDytEMu3wL',
  'FLASHRzANfcAKDuQ3RXv9hbkBy4WVEKDzoAgxJ56DiE4',
  'FLasHstqx11M8W56zrSEqkCyhMCCpr6ze6Mjdvqope5s',
  'FLAShWTjcweNT4NSotpjpxAkwxUr2we3eXQGhpTVzRwy',
  'FLasHXTqrbNvpWFB6grN47HGZfK6pze9HLNTgbukfPSk',
  'FLAShyAyBcKb39KPxSzXcepiS8iDYUhDGwJcJDPX4g2B',
  'FLAsHZTRcf3Dy1APaz6j74ebdMC6Xx4g6i9YxjyrDybR',
];

const HELIUS_TIP_ACCOUNTS = [
  '4ACfpUFoaSD9bfPdeu6DBt89gB6ENTeHBXCAi87NhDEE',
  'D2L6yPZ2FmmmTKPgzaMKdhu6EWZcTpLy1Vhx8uvZe7NZ',
  '9bnz4RShgq1hAnLnZbP8kbgBg1kEmcJBYQq3gQbmnSta',
  '5VY91ws6B2hMmBFRsXkoAAdsPHBJwRfBht4DXox3xkwn',
  '2nyhqdwKcJZR2vcqCyrYsaPVdAnFoJjiksCXJ7hfEYgD',
  '2q5pghRs6arqVjRvT5gfgWfWcHWmw1ZuCzphgd5KfWGJ',
  'wyvPkWjVZz1M8fHQnMMCDTQDbkManefNNhweYk5WkcF',
  '3KCKozbAaF75qEU33jtzozcJ29yJuaLJTy2jFdzUY8bT',
  '4vieeGHPYPG2MmyPRcYjdiDmmhN3ww7hsFNap8pVN3Ey',
  '4TQLFNWK8AovT1gFvda5jfw2oJeRMKEmw7aH6MGBJ3or',
];

const NODE1_TIP_ACCOUNTS = [
  'node1PqAa3BWWzUnTHVbw8NJHC874zn9ngAkXjgWEej',
  'node1UzzTxAAeBTpfZkQPJXBAqixsbdth11ba1NXLBG',
  'node1Qm1bV4fwYnCurP8otJ9s5yrkPq7SPZ5uhj3Tsv',
  'node1PUber6SFmSQgvf2ECmXsHP5o3boRSGhvJyPMX1',
  'node1AyMbeqiVN6eoQzEAwCA6Pk826hrdqdAHR7cdJ3',
  'node1YtWCoTwwVYTFLfS19zquRQzYX332hs1HEuRBjC',
];

const BLOCK_RAZOR_TIP_ACCOUNTS = [
  'FjmZZrFvhnqqb9ThCuMVnENaM3JGVuGWNyCAxRJcFpg9',
  '6No2i3aawzHsjtThw81iq1EXPJN6rh8eSJCLaYZfKDTG',
  'A9cWowVAiHe9pJfKAj3TJiN9VpbzMUq6E4kEvf5mUT22',
  'Gywj98ophM7GmkDdaWs4isqZnDdFCW7B46TXmKfvyqSm',
  '68Pwb4jS7eZATjDfhmTXgRJjCiZmw1L7Huy4HNpnxJ3o',
  '4ABhJh5rZPjv63RBJBuyWzBK3g9gWMUQdTZP2kiW31V9',
  'B2M4NG5eyZp5SBQrSdtemzk5TqVuaWGQnowGaCBt8GyM',
  '5jA59cXMKQqZAVdtopv8q3yyw9SYfiE3vUCbt7p8MfVf',
  '5YktoWygr1Bp9wiS1xtMtUki1PeYuuzuCF98tqwYxf61',
  '295Avbam4qGShBYK7E9H5Ldew4B3WyJGmgmXfiWdeeyV',
  'EDi4rSy2LZgKJX74mbLTFk4mxoTgT6F7HxxzG2HBAFyK',
  'BnGKHAC386n4Qmv9xtpBVbRaUTKixjBe3oagkPFKtoy6',
  'Dd7K2Fp7AtoN8xCghKDRmyqr5U169t48Tw5fEd3wT9mq',
  'AP6qExwrbRgBAVaehg4b5xHENX815sMabtBzUzVB4v8S',
];

const ASTRALANE_TIP_ACCOUNTS = [
  'astrazznxsGUhWShqgNtAdfrzP2G83DzcWVJDxwV9bF',
  'astra4uejePWneqNaJKuFFA8oonqCE1sqF6b45kDMZm',
  'astra9xWY93QyfG6yM8zwsKsRodscjQ2uU2HKNL5prk',
  'astraRVUuTHjpwEVvNBeQEgwYx9w9CFyfxjYoobCZhL',
  'astraEJ2fEj8Xmy6KLG7B3VfbKfsHXhHrNdCQx7iGJK',
  'astraubkDw81n4LuutzSQ8uzHCv4BhPVhfvTcYv8SKC',
  'astraZW5GLFefxNPAatceHhYjfA1ciq9gvfEg2S47xk',
  'astrawVNP4xDBKT7rAdxrLYiTSTdqtUr63fSMduivXK',
  'AstrA1ejL4UeXC2SBP4cpeEmtcFPZVLxx3XGKXyCW6to',
  'AsTra79FET4aCKWspPqeSFvjJNyp96SvAnrmyAxqg5b7',
  'AstrABAu8CBTyuPXpV4eSCJ5fePEPnxN8NqBaPKQ9fHR',
  'AsTRADtvb6tTmrsqULQ9Wji9PigDMjhfEMza6zkynEvV',
  'AsTRAEoyMofR3vUPpf9k68Gsfb6ymTZttEtsAbv8Bk4d',
  'AStrAJv2RN2hKCHxwUMtqmSxgdcNZbihCwc1mCSnG83W',
  'Astran35aiQUF57XZsmkWMtNCtXGLzs8upfiqXxth2bz',
  'AStRAnpi6kFrKypragExgeRoJ1QnKH7pbSjLAKQVWUum',
  'ASTRaoF93eYt73TYvwtsv6fMWHWbGmMUZfVZPo3CRU9C',
];

const BLOXROUTE_TIP_ACCOUNTS = [
  'HWEoBxYs7ssKuudEjzjmpfJVX7Dvi7wescFsVx2L5yoY',
  '95cfoy472fcQHaw4tPGBTKpn6ZQnfEPfBgDQx6gcRmRg',
  '3UQUKjhMKaY2S6bjcQD6yHB7utcZt5bfarRCmctpRtUd',
  'FogxVNs6Mm2w9rnGL1vkARSwJxvLE8mujTv3LK8RnUhF',
];

const STELLIUM_TIP_ACCOUNTS = [
  'ste11JV3MLMM7x7EJUM2sXcJC1H7F4jBLnP9a9PG8PH',
  'ste11MWPjXCRfQryCshzi86SGhuXjF4Lv6xMXD2AoSt',
  'ste11p5x8tJ53H1NbNQsRBg1YNRd4GcVpxtDw8PBpmb',
  'ste11p7e2KLYou5bwtt35H7BM6uMdo4pvioGjJXKFcN',
  'ste11TMV68LMi1BguM4RQujtbNCZvf1sjsASpqgAvSX',
];

const NEXT_BLOCK_TIP_ACCOUNTS = [
  'NextbLoCkVtMGcV47JzewQdvBpLqT9TxQFozQkN98pE',
  'NexTbLoCkWykbLuB1NkjXgFWkX9oAtcoagQegygXXA2',
  'NeXTBLoCKs9F1y5PJS9CKrFNNLU1keHW71rfh7KgA1X',
  'NexTBLockJYZ7QD7p2byrUa6df8ndV2WSd8GkbWqfbb',
  'neXtBLock1LeC67jYd1QdAa32kbVeubsfPNTJC1V5At',
  'nEXTBLockYgngeRmRrjDV31mGSekVPqZoMGhQEZtPVG',
  'NEXTbLoCkB51HpLBLojQfpyVAMorm3zzKg7w9NFdqid',
  'nextBLoCkPMgmG8ZgJtABeScP35qLa2AMCNKntAP7Xc',
];

const SOYAS_TIP_ACCOUNTS = [
  'soyas4s6L8KWZ8rsSk1mF3d1mQScoTGGAgjk98bF8nP',
  'soyascXFW5wEEYiwfEmHy2pNwomqzvggJosGVD6TJdY',
  'soyasDBdKjADwPz3xk82U3TNPRDKEWJj7wWLajNHZ1L',
  'soyasE2abjBAynmHbGWgEwk4ctBy7JMTUCNrMbjcnyH',
  'soyasi59njacMUPvo3TM5paHjeK8pYSdovXgFi32gRt',
  'soyasQYhJxv8uZgWDxhg72td6piAf7XTkoyWHtSATEz',
  'soyastP66xyYC8XADXZjdMM5BAVGD2YRvz8dwtLsqb8',
  'soyasvdgUJWYcUCzDxpmjUnNjH7KamXLXTzLwFvdVPE',
  'soyasvxAunisNxaoRxkKGjNir7KmbwYnr37JmefkX9G',
  'soyas5doVFUwH8s5zK8gEvCL5KR5ogDmf52LsrJEZ9h',
];

const SPEEDLANDING_TIP_ACCOUNTS = [
  'SpEEdz8S1KorkMZqjMUxfxrmWwofmp6ReNP2Nx6CUmq',
  'SpeeDy3GJM4wcrQmk1itRFWgidvxX4rwjTLMv78wwjE',
  'SPeEdva37vW8vRtqgYjprQs1g3965icfVN5Rt7SMAyh',
  'speEdrSEpox5GUfHWcBc7tQjRuSfUin2yvB7qoYvvJh',
  'SPeEDmkHkN3A2roSZf6aZyEMsmrGqTHKqwP51y2Y4rV',
  'SpeedLdTJXh2RKpXEaP8JCxkWoUVXhtdPQ1EnxBJMxc',
  'SpEediGKLbbXndSYTzwmz6Z3NDgHQLDcTDEvGFkSMH9',
  'speede8xCcUq2Tiv1efXeTuE3k9TDNq8TnGKaKSc6J4',
];

const SOLAMI_TIP_ACCOUNTS = [
  '15qWd4huAkoxvhDsHMfpUn27TW1YBYMMJJ2jkAkbeam',
  '9XuGciSwr5wb7dLTQm91JhuBTvj3GG8WjuRDc3obeam',
  'kiQioJNyFG7pU36ELLsRKXkeT48kFbk3b6rSgrWbeam',
  'kjmVhW1UzJrW2sU5bY5NtZ79jpvjSStsj37Pzmabeam',
  'kREnjPWFpt4AHeY5pijPmyXaCrMnbatUQJo7d3Xbeam',
  'praRZG6N6MdbsT4EFpKgZJWReZGXQhAMFcH68oCbeam',
  'SqoKQKU5uwBxovq3R7yEBxFwptc4z7vwoghU3M9beam',
  'sV72TY66T1RfmDSeHPPbwX6wwJ3bBv5hd4ehJ8tbeam',
  'swf8MyEeLo7gtRUo27UuJj6naCASUrypU7dbteSbeam',
  'uiuaQsxA47JybQAVN4FTfYuoEDkMiXV1r591Aewbeam',
];

const LUNARLANDER_TIP_ACCOUNTS = [
  'moon17L6BgxXRX5uHKudAmqVF96xia9h8ygcmG2sL3F',
  'moon26Sek222Md7ZydcAGxoKG832DK36CkLrS3PQY4c',
  'moon7fwyajcVstMoBnVy7UBcTx87SBtNoGGAaH2Cb8V',
  'moonBtH9HvLHjLqi9ivyrMVKgFUsSfrz9BwQ9khhn1u',
  'moonCJg8476LNFLptX1qrK8PdRsA1HD1R6XWyu9MB93',
  'moonF2sz7qwAtdETnrgxNbjonnhGGjd6r4W4UC9284s',
  'moonKfftMiGSak3cezvhEqvkPSzwrmQxQHXuspC96yj',
  'moonQBUKBpkifLcTd78bfxxt4PYLwmJ5admLW6cBBs8',
  'moonXwpKwoVkMegt5Bc776cSW793X1irL5hHV1vJ3JA',
  'moonZ6u9E2fgk6eWd82621eLPHt9zuJuYECXAYjMY1C',
];

const GLAIVE_TIP_ACCOUNTS = [
  'GLaiv4GMRYQmthatDS98uQT4HoucgxWT8NeJz6oSwxeU',
  'GLaivL5uPrDpvd1wTtvat38KGqb5WLhEdqQfnmNd3oNr',
  'GLaivinAWh21NaJMhtExtD5G2gZs1xnvaYVZmwqobWZL',
  'GLaivJSUL71FcocYa8tks5vpVyYzvaDMHtyrzfQF2ABr',
  'GLaivRU6eDKrta3p3psFAWPEFLzCjeMHGpPUuQqTjtyv',
  'GLaivq5dU8qHayz9Qf13LjPfVy3SmUhbmickfGiZdmfh',
];

// ===== Region Endpoint Maps =====

export const JITO_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'https://ny.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Frankfurt]: 'https://frankfurt.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Amsterdam]: 'https://amsterdam.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Dublin]: 'https://dublin.mainnet.block-engine.jito.wtf',
  [SwqosRegion.SLC]: 'https://slc.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Tokyo]: 'https://tokyo.mainnet.block-engine.jito.wtf',
  [SwqosRegion.London]: 'https://london.mainnet.block-engine.jito.wtf',
  [SwqosRegion.LosAngeles]: 'https://slc.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Singapore]: 'https://singapore.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Default]: 'https://mainnet.block-engine.jito.wtf',
};

export const BLOXROUTE_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'https://ny.solana.dex.blxrbdn.com',
  [SwqosRegion.Frankfurt]: 'https://germany.solana.dex.blxrbdn.com',
  [SwqosRegion.Amsterdam]: 'https://amsterdam.solana.dex.blxrbdn.com',
  [SwqosRegion.Dublin]: 'https://uk.solana.dex.blxrbdn.com',
  [SwqosRegion.SLC]: 'https://ny.solana.dex.blxrbdn.com',
  [SwqosRegion.Tokyo]: 'https://tokyo.solana.dex.blxrbdn.com',
  [SwqosRegion.London]: 'https://uk.solana.dex.blxrbdn.com',
  [SwqosRegion.LosAngeles]: 'https://la.solana.dex.blxrbdn.com',
  [SwqosRegion.Singapore]: 'https://tokyo.solana.dex.blxrbdn.com',
  [SwqosRegion.Default]: 'https://global.solana.dex.blxrbdn.com',
};

export const ZERO_SLOT_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ny.0slot.trade',
  [SwqosRegion.Frankfurt]: 'http://de2.0slot.trade',
  [SwqosRegion.Amsterdam]: 'http://ams.0slot.trade',
  [SwqosRegion.Dublin]: 'http://ams.0slot.trade',
  [SwqosRegion.SLC]: 'http://la.0slot.trade',
  [SwqosRegion.Tokyo]: 'http://jp.0slot.trade',
  [SwqosRegion.London]: 'http://ams.0slot.trade',
  [SwqosRegion.LosAngeles]: 'http://la.0slot.trade',
  [SwqosRegion.Singapore]: 'http://jp.0slot.trade',
  [SwqosRegion.Default]: 'http://de2.0slot.trade',
};

export const TEMPORAL_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ewr1.nozomi.temporal.xyz',
  [SwqosRegion.Frankfurt]: 'http://fra2.nozomi.temporal.xyz',
  [SwqosRegion.Amsterdam]: 'http://ams1.nozomi.temporal.xyz',
  [SwqosRegion.Dublin]: 'http://lon1.nozomi.temporal.xyz',
  [SwqosRegion.SLC]: 'http://lax1.nozomi.temporal.xyz',
  [SwqosRegion.Tokyo]: 'http://tyo1.nozomi.temporal.xyz',
  [SwqosRegion.London]: 'http://lon1.nozomi.temporal.xyz',
  [SwqosRegion.LosAngeles]: 'http://lax1.nozomi.temporal.xyz',
  [SwqosRegion.Singapore]: 'http://sgp1.nozomi.temporal.xyz',
  [SwqosRegion.Default]: 'http://fra2.nozomi.temporal.xyz',
};

export const FLASH_BLOCK_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ny.flashblock.trade',
  [SwqosRegion.Frankfurt]: 'http://fra.flashblock.trade',
  [SwqosRegion.Amsterdam]: 'http://ams.flashblock.trade',
  [SwqosRegion.Dublin]: 'http://london.flashblock.trade',
  [SwqosRegion.SLC]: 'http://slc.flashblock.trade',
  [SwqosRegion.Tokyo]: 'http://tokyo.flashblock.trade',
  [SwqosRegion.London]: 'http://london.flashblock.trade',
  [SwqosRegion.LosAngeles]: 'http://slc.flashblock.trade',
  [SwqosRegion.Singapore]: 'http://singapore.flashblock.trade',
  [SwqosRegion.Default]: 'http://fra.flashblock.trade',
};

export const HELIUS_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ewr-sender.helius-rpc.com/fast',
  [SwqosRegion.Frankfurt]: 'http://fra-sender.helius-rpc.com/fast',
  [SwqosRegion.Amsterdam]: 'http://ams-sender.helius-rpc.com/fast',
  [SwqosRegion.Dublin]: 'http://lon-sender.helius-rpc.com/fast',
  [SwqosRegion.SLC]: 'http://slc-sender.helius-rpc.com/fast',
  [SwqosRegion.Tokyo]: 'http://tyo-sender.helius-rpc.com/fast',
  [SwqosRegion.London]: 'http://lon-sender.helius-rpc.com/fast',
  [SwqosRegion.LosAngeles]: 'http://slc-sender.helius-rpc.com/fast',
  [SwqosRegion.Singapore]: 'http://sg-sender.helius-rpc.com/fast',
  [SwqosRegion.Default]: 'https://sender.helius-rpc.com/fast',
};

export const NODE1_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ny.node1.me',
  [SwqosRegion.Frankfurt]: 'http://fra.node1.me',
  [SwqosRegion.Amsterdam]: 'http://ams.node1.me',
  [SwqosRegion.Dublin]: 'http://lon.node1.me',
  [SwqosRegion.SLC]: 'http://ny.node1.me',
  [SwqosRegion.Tokyo]: 'http://tk.node1.me',
  [SwqosRegion.London]: 'http://lon.node1.me',
  [SwqosRegion.LosAngeles]: 'http://ny.node1.me',
  [SwqosRegion.Singapore]: 'http://tk.node1.me',
  [SwqosRegion.Default]: 'http://fra.node1.me',
};

export const BLOCK_RAZOR_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://newyork.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.Frankfurt]: 'http://frankfurt.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.Amsterdam]: 'http://amsterdam.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.Dublin]: 'http://london.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.SLC]: 'http://newyork.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.Tokyo]: 'http://tokyo.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.London]: 'http://london.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.LosAngeles]: 'http://losangeles.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.Singapore]: 'http://singapore.solana.blockrazor.xyz:443/sendTransaction',
  [SwqosRegion.Default]: 'http://frankfurt.solana.blockrazor.xyz:443/sendTransaction',
};

export const BLOCK_RAZOR_GRPC_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'newyork.solana-grpc.blockrazor.xyz:80',
  [SwqosRegion.Frankfurt]: 'frankfurt.solana-grpc.blockrazor.xyz:80',
  [SwqosRegion.Amsterdam]: 'amsterdam.solana-grpc.blockrazor.xyz:80',
  [SwqosRegion.Dublin]: 'london.solana-grpc.blockrazor.xyz:80',
  [SwqosRegion.SLC]: 'newyork.solana-grpc.blockrazor.xyz:80',
  [SwqosRegion.Tokyo]: 'tokyo.solana-grpc.blockrazor.xyz:80',
  [SwqosRegion.London]: 'london.solana-grpc.blockrazor.xyz:80',
  [SwqosRegion.LosAngeles]: 'losangeles.solana-grpc.blockrazor.xyz:80',
  [SwqosRegion.Singapore]: 'singapore.solana-grpc.blockrazor.xyz:80',
  [SwqosRegion.Default]: 'frankfurt.solana-grpc.blockrazor.xyz:80',
};

export const ASTRALANE_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ny.gateway.astralane.io/irisb',
  [SwqosRegion.Frankfurt]: 'http://fr.gateway.astralane.io/irisb',
  [SwqosRegion.Amsterdam]: 'http://ams.gateway.astralane.io/irisb',
  [SwqosRegion.Dublin]: 'http://ams.gateway.astralane.io/irisb',
  [SwqosRegion.SLC]: 'http://la.gateway.astralane.io/irisb',
  [SwqosRegion.Tokyo]: 'http://jp.gateway.astralane.io/irisb',
  [SwqosRegion.London]: 'http://ams.gateway.astralane.io/irisb',
  [SwqosRegion.LosAngeles]: 'http://la.gateway.astralane.io/irisb',
  [SwqosRegion.Singapore]: 'http://sg.gateway.astralane.io/irisb',
  [SwqosRegion.Default]: 'https://edge.astralane.io/irisb',
};

export const ASTRALANE_QUIC_HOSTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'ny.gateway.astralane.io',
  [SwqosRegion.Frankfurt]: 'fr.gateway.astralane.io',
  [SwqosRegion.Amsterdam]: 'ams.gateway.astralane.io',
  [SwqosRegion.Dublin]: 'ams.gateway.astralane.io',
  [SwqosRegion.SLC]: 'la.gateway.astralane.io',
  [SwqosRegion.Tokyo]: 'jp.gateway.astralane.io',
  [SwqosRegion.London]: 'ams.gateway.astralane.io',
  [SwqosRegion.LosAngeles]: 'la.gateway.astralane.io',
  [SwqosRegion.Singapore]: 'sg.gateway.astralane.io',
  [SwqosRegion.Default]: 'lim.gateway.astralane.io',
};

export const STELLIUM_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ewr1.flashrpc.com',
  [SwqosRegion.Frankfurt]: 'http://fra1.flashrpc.com',
  [SwqosRegion.Amsterdam]: 'http://ams1.flashrpc.com',
  [SwqosRegion.Dublin]: 'http://lhr1.flashrpc.com',
  [SwqosRegion.SLC]: 'http://ewr1.flashrpc.com',
  [SwqosRegion.Tokyo]: 'http://tyo1.flashrpc.com',
  [SwqosRegion.London]: 'http://lhr1.flashrpc.com',
  [SwqosRegion.LosAngeles]: 'http://ewr1.flashrpc.com',
  [SwqosRegion.Singapore]: 'http://tyo1.flashrpc.com',
  [SwqosRegion.Default]: 'http://fra1.flashrpc.com',
};

export const NEXT_BLOCK_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ny.nextblock.io',
  [SwqosRegion.Frankfurt]: 'http://fra.nextblock.io',
  [SwqosRegion.Amsterdam]: 'http://ams.nextblock.io',
  [SwqosRegion.Dublin]: 'http://dublin.nextblock.io',
  [SwqosRegion.SLC]: 'http://slc.nextblock.io',
  [SwqosRegion.Tokyo]: 'http://tokyo.nextblock.io',
  [SwqosRegion.London]: 'http://london.nextblock.io',
  [SwqosRegion.LosAngeles]: 'http://slc.nextblock.io',
  [SwqosRegion.Singapore]: 'http://sgp.nextblock.io',
  [SwqosRegion.Default]: 'http://fra.nextblock.io',
};

export const SOYAS_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'nyc.landing.soyas.xyz:9000',
  [SwqosRegion.Frankfurt]: 'fra.landing.soyas.xyz:9000',
  [SwqosRegion.Amsterdam]: 'ams.landing.soyas.xyz:9000',
  [SwqosRegion.Dublin]: 'lon.landing.soyas.xyz:9000',
  [SwqosRegion.SLC]: 'nyc.landing.soyas.xyz:9000',
  [SwqosRegion.Tokyo]: 'tyo.landing.soyas.xyz:9000',
  [SwqosRegion.London]: 'lon.landing.soyas.xyz:9000',
  [SwqosRegion.LosAngeles]: 'nyc.landing.soyas.xyz:9000',
  [SwqosRegion.Singapore]: 'tyo.landing.soyas.xyz:9000',
  [SwqosRegion.Default]: 'fra.landing.soyas.xyz:9000',
};

export const SPEEDLANDING_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'nyc.speedlanding.trade:17778',
  [SwqosRegion.Frankfurt]: 'fra.speedlanding.trade:17778',
  [SwqosRegion.Amsterdam]: 'ams.speedlanding.trade:17778',
  [SwqosRegion.Dublin]: 'ams.speedlanding.trade:17778',
  [SwqosRegion.SLC]: 'nyc.speedlanding.trade:17778',
  [SwqosRegion.Tokyo]: 'tyo.speedlanding.trade:17778',
  [SwqosRegion.London]: 'ams.speedlanding.trade:17778',
  [SwqosRegion.LosAngeles]: 'nyc.speedlanding.trade:17778',
  [SwqosRegion.Singapore]: 'sgp.speedlanding.trade:17778',
  [SwqosRegion.Default]: 'fra.speedlanding.trade:17778',
};

export const SOLAMI_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'beam.solami.dev:11000',
  [SwqosRegion.Frankfurt]: 'beam.solami.dev:11000',
  [SwqosRegion.Amsterdam]: 'beam.solami.dev:11000',
  [SwqosRegion.Dublin]: 'beam.solami.dev:11000',
  [SwqosRegion.SLC]: 'beam.solami.dev:11000',
  [SwqosRegion.Tokyo]: 'beam.solami.dev:11000',
  [SwqosRegion.Singapore]: 'beam.solami.dev:11000',
  [SwqosRegion.London]: 'beam.solami.dev:11000',
  [SwqosRegion.LosAngeles]: 'beam.solami.dev:11000',
  [SwqosRegion.Default]: 'beam.solami.dev:11000',
};

export const LUNARLANDER_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://nyc-1.prod.lunar-lander.hellomoon.io',
  [SwqosRegion.Frankfurt]: 'http://fra-1.prod.lunar-lander.hellomoon.io',
  [SwqosRegion.Amsterdam]: 'http://ams-1.prod.lunar-lander.hellomoon.io',
  [SwqosRegion.Dublin]: 'http://ams-1.prod.lunar-lander.hellomoon.io',
  [SwqosRegion.SLC]: 'http://ash-2.prod.lunar-lander.hellomoon.io',
  [SwqosRegion.Tokyo]: 'http://tyo-1.prod.lunar-lander.hellomoon.io',
  [SwqosRegion.Singapore]: 'http://tyo-1.prod.lunar-lander.hellomoon.io',
  [SwqosRegion.London]: 'http://fra-1.prod.lunar-lander.hellomoon.io',
  [SwqosRegion.LosAngeles]: 'http://nyc-1.prod.lunar-lander.hellomoon.io',
  [SwqosRegion.Default]: 'http://nyc-1.prod.lunar-lander.hellomoon.io',
};

export const LUNARLANDER_QUIC_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'nyc-1.prod.lunar-lander.hellomoon.io:16888',
  [SwqosRegion.Frankfurt]: 'fra-1.prod.lunar-lander.hellomoon.io:16888',
  [SwqosRegion.Amsterdam]: 'ams-1.prod.lunar-lander.hellomoon.io:16888',
  [SwqosRegion.Dublin]: 'ams-1.prod.lunar-lander.hellomoon.io:16888',
  [SwqosRegion.SLC]: 'ash-2.prod.lunar-lander.hellomoon.io:16888',
  [SwqosRegion.Tokyo]: 'tyo-1.prod.lunar-lander.hellomoon.io:16888',
  [SwqosRegion.Singapore]: 'tyo-1.prod.lunar-lander.hellomoon.io:16888',
  [SwqosRegion.London]: 'fra-1.prod.lunar-lander.hellomoon.io:16888',
  [SwqosRegion.LosAngeles]: 'nyc-1.prod.lunar-lander.hellomoon.io:16888',
  [SwqosRegion.Default]: 'nyc-1.prod.lunar-lander.hellomoon.io:16888',
};

export const GLAIVE_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ny.glaive.trade',
  [SwqosRegion.Frankfurt]: 'http://fra.glaive.trade',
  [SwqosRegion.Amsterdam]: 'http://ams1.glaive.trade',
  [SwqosRegion.Dublin]: 'http://lon.glaive.trade',
  [SwqosRegion.SLC]: 'http://ny.glaive.trade',
  [SwqosRegion.Tokyo]: 'http://ams1.glaive.trade',
  [SwqosRegion.Singapore]: 'http://fra.glaive.trade',
  [SwqosRegion.London]: 'http://lon.glaive.trade',
  [SwqosRegion.LosAngeles]: 'http://ny.glaive.trade',
  [SwqosRegion.Default]: 'http://ams1.glaive.trade',
};

export const GLAIVE_QUIC_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'ny.glaive.trade:4000',
  [SwqosRegion.Frankfurt]: 'fra.glaive.trade:4000',
  [SwqosRegion.Amsterdam]: 'ams1.glaive.trade:4000',
  [SwqosRegion.Dublin]: 'lon.glaive.trade:4000',
  [SwqosRegion.SLC]: 'ny.glaive.trade:4000',
  [SwqosRegion.Tokyo]: 'ams1.glaive.trade:4000',
  [SwqosRegion.Singapore]: 'fra.glaive.trade:4000',
  [SwqosRegion.London]: 'lon.glaive.trade:4000',
  [SwqosRegion.LosAngeles]: 'ny.glaive.trade:4000',
  [SwqosRegion.Default]: 'ams1.glaive.trade:4000',
};

// ===== SWQOS Client Interface =====

export interface SwqosClient {
  sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string>;

  sendTransactions(
    tradeType: TradeType,
    transactions: Buffer[],
    waitConfirmation: boolean
  ): Promise<string[]>;

  getTipAccount(): string;
  getSwqosType(): SwqosType;
  minTipSol(): number;
}

// ===== HTTP Client Base =====

/** Adapt a raw-byte SWQOS client to CachedTradeExecutor; never requests confirmation. */
export function createCachedWireSubmit(client: SwqosClient) {
  return async (wire: Uint8Array, direction: "Buy" | "Sell"): Promise<string> => {
    if (direction !== "Buy" && direction !== "Sell") throw new TradeError(400, "Explicit Buy/Sell required");
    const expected=signatureFromSerializedTransaction(wire);
    const returned=await client.sendTransaction(direction === "Buy" ? TradeType.Buy : TradeType.Sell, Buffer.from(wire), false);
    if(returned!==expected)throw new TradeError(400,"Submission signature does not match raw transaction");
    return returned;
  };
}

abstract class BaseClient implements SwqosClient {
  abstract getTipAccount(): string;
  abstract getSwqosType(): SwqosType;
  abstract minTipSol(): number;
  abstract sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string>;

  async sendTransactions(
    tradeType: TradeType,
    transactions: Buffer[],
    waitConfirmation: boolean
  ): Promise<string[]> {
    const signatures: string[] = [];
    for (const tx of transactions) {
      const sig = await this.sendTransaction(tradeType, tx, waitConfirmation);
      signatures.push(sig);
    }
    return signatures;
  }

  protected async post(url: string, payload: unknown, headers: Record<string, string> = {}): Promise<unknown> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new TradeError(response.status, `HTTP error: ${response.statusText}`);
    }

    return parseBodyAsJsonOrText(response);
  }

  protected async postRaw(
    url: string,
    body: string | Buffer | Uint8Array,
    headers: Record<string, string> = {},
    contentType = 'text/plain',
  ): Promise<unknown> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        ...headers,
      },
      body,
    });

    if (!response.ok) {
      throw new TradeError(response.status, `HTTP error: ${response.statusText}`);
    }

    return parseBodyAsJsonOrText(response);
  }
}

function shouldFallbackTransport(error: unknown): boolean {
  if (error instanceof TradeError) {
    return error.code >= 500 || error.code === 408 || error.code === 425;
  }
  const grpcCode = (error as { code?: number } | undefined)?.code;
  if (typeof grpcCode === 'number') {
    return [grpc.status.UNAVAILABLE, grpc.status.DEADLINE_EXCEEDED, grpc.status.INTERNAL].includes(grpcCode);
  }
  if (error instanceof TypeError) return true;
  const value = error as { code?: unknown; cause?: unknown } | undefined;
  const networkCodes = new Set([
    'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH',
    'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET',
  ]);
  if (typeof value?.code === 'string' && networkCodes.has(value.code)) return true;
  return value?.cause !== undefined && value.cause !== error
    ? shouldFallbackTransport(value.cause)
    : false;
}

export class FallbackSwqosClient implements SwqosClient {
  constructor(
    readonly primary: SwqosClient,
    readonly fallback: SwqosClient,
  ) {}

  async sendTransaction(tradeType: TradeType, transaction: Buffer, waitConfirmation: boolean): Promise<string> {
    try {
      return await this.primary.sendTransaction(tradeType, transaction, waitConfirmation);
    } catch (error) {
      if (!shouldFallbackTransport(error)) throw error;
      return this.fallback.sendTransaction(tradeType, transaction, waitConfirmation);
    }
  }

  async sendTransactions(tradeType: TradeType, transactions: Buffer[], waitConfirmation: boolean): Promise<string[]> {
    try {
      return await this.primary.sendTransactions(tradeType, transactions, waitConfirmation);
    } catch (error) {
      if (!shouldFallbackTransport(error)) throw error;
      return this.fallback.sendTransactions(tradeType, transactions, waitConfirmation);
    }
  }

  getTipAccount(): string { return this.primary.getTipAccount(); }
  getSwqosType(): SwqosType { return this.primary.getSwqosType(); }
  minTipSol(): number { return this.primary.minTipSol(); }
}

// ===== Jito Client =====

export class JitoClient extends BaseClient {
  private tipAccounts = JITO_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        encoded,
        { encoding: 'base64' },
      ],
    };

    const headers: Record<string, string> = {};
    let url = `${this.endpoint}/api/v1/transactions`;
    if (this.authToken) {
      headers['x-jito-auth'] = this.authToken;
      url = `${this.endpoint}/api/v1/transactions?uuid=${this.authToken}`;
    }

    const result = (await this.post(url, payload, headers)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message);
    }

    return extractSubmitSignature(result);
  }

  async sendTransactions(
    tradeType: TradeType,
    transactions: Buffer[],
    waitConfirmation: boolean
  ): Promise<string[]> {
    if (transactions.length === 0) return [];
    if (transactions.length === 1) {
      const tx = transactions[0]!;
      return [await this.sendTransaction(tradeType, tx, waitConfirmation)];
    }

    const encodedTxs = transactions.map(tx => tx.toString('base64'));

    const payload = {
      jsonrpc: '2.0',
      method: 'sendBundle',
      params: [encodedTxs, { encoding: 'base64' }],
      id: 1,
    };

    const headers: Record<string, string> = {};
    let url = `${this.endpoint}/api/v1/bundles`;
    if (this.authToken) {
      headers['x-jito-auth'] = this.authToken;
      url = `${this.endpoint}/api/v1/bundles?uuid=${this.authToken}`;
    }

    const result = (await this.post(url, payload, headers)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message);
    }

    // Bundle returns a single bundle ID, wrap in array for interface compatibility
    return [extractSubmitSignature(result)];
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Jito;
  }

  minTipSol(): number {
    return MIN_TIP_JITO;
  }
}

// ===== Bloxroute Client =====

export class BloxrouteClient extends BaseClient {
  private tipAccounts = BLOXROUTE_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      transaction: { content: encoded },
      frontRunningProtection: false,
      useStakedRPCs: true,
    };

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['Authorization'] = this.authToken;
    }

    const url = `${this.endpoint}/api/v2/submit`;
    const result = (await this.post(url, payload, headers)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message || result.error);
    }
    if (result.reason) {
      throw new TradeError(500, result.reason);
    }

    return extractSubmitSignature(result);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Bloxroute;
  }

  minTipSol(): number {
    return MIN_TIP_BLOXROUTE;
  }
}

// ===== ZeroSlot Client =====

export class ZeroSlotClient extends BaseClient {
  private tipAccounts = ZERO_SLOT_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [encoded, { encoding: 'base64' }],
    };

    // Auth in URL param, no Authorization header
    let url = this.endpoint;
    if (this.authToken) {
      url = `${this.endpoint}?api-key=${this.authToken}`;
    }

    const result = (await this.post(url, payload)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message || String(result.error));
    }

    return extractSubmitSignature(result);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.ZeroSlot;
  }

  minTipSol(): number {
    return MIN_TIP_ZERO_SLOT;
  }
}

// ===== Temporal Client =====

const TEMPORAL_MAX_BATCH_SIZE = 16;
const TEMPORAL_MIN_TX_SIZE = 66;
const TEMPORAL_MAX_TX_SIZE = 1232;

export function encodeTemporalBatch(transactions: readonly Buffer[]): Buffer {
  if (transactions.length === 0) {
    throw new TradeError(400, 'Temporal batch cannot be empty');
  }
  if (transactions.length > TEMPORAL_MAX_BATCH_SIZE) {
    throw new TradeError(400, `Temporal batch has ${transactions.length} transactions; maximum is ${TEMPORAL_MAX_BATCH_SIZE}`);
  }
  let size = 0;
  for (const tx of transactions) {
    if (tx.length < TEMPORAL_MIN_TX_SIZE || tx.length > TEMPORAL_MAX_TX_SIZE) {
      throw new TradeError(400, `Temporal transaction size ${tx.length} is outside ${TEMPORAL_MIN_TX_SIZE}..${TEMPORAL_MAX_TX_SIZE} bytes`);
    }
    size += 2 + tx.length;
  }
  const body = Buffer.allocUnsafe(size);
  let offset = 0;
  for (const tx of transactions) {
    body.writeUInt16BE(tx.length, offset);
    offset += 2;
    tx.copy(body, offset);
    offset += tx.length;
  }
  return body;
}

function temporalBatchUrl(endpoint: string, authToken?: string, forceTls = false): string {
  const raw = /^https?:\/\//.test(endpoint) ? endpoint : `http://${endpoint}`;
  const url = new URL(raw);
  if (forceTls) url.protocol = 'https:';
  url.pathname = '/api/sendBatch';
  if (authToken) url.searchParams.set('c', authToken);
  return url.toString();
}

async function postTemporalHttp3(url: string, body: Buffer): Promise<void> {
  let quico: typeof import('quico')['default'];
  try {
    ({ default: quico } = await import('quico'));
  } catch (error) {
    throw new TradeError(501, 'Temporal QUIC/HTTP3 is unavailable in this runtime', error as Error);
  }
  await new Promise<void>((resolve, reject) => {
    const request = quico.request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(body.length),
      },
      timeout: 3000,
    }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        const status = response.statusCode ?? 500;
        if (status >= 200 && status < 300) {
          resolve();
        } else {
          reject(new TradeError(status, `Temporal HTTP/3 error: ${Buffer.concat(chunks).toString() || status}`));
        }
      });
    });
    request.on('timeout', () => {
      request.abort();
      reject(new TradeError(408, 'Temporal HTTP/3 request timed out'));
    });
    request.on('error', error => {
      reject(new TradeError(503, `Temporal HTTP/3 transport error: ${error.message}`, error));
    });
    request.end(body);
  });
}

export class TemporalClient extends BaseClient {
  private tipAccounts = TEMPORAL_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const body = encodeTemporalBatch([transaction]);
    await this.postRaw(
      temporalBatchUrl(this.endpoint, this.authToken),
      body,
      {},
      'application/octet-stream',
    );
    return signatureFromSerializedTransaction(transaction);
  }

  override async sendTransactions(tradeType: TradeType, transactions: Buffer[], waitConfirmation: boolean): Promise<string[]> {
    const signatures: string[] = [];
    for (let start = 0; start < transactions.length; start += TEMPORAL_MAX_BATCH_SIZE) {
      const batch = transactions.slice(start, start + TEMPORAL_MAX_BATCH_SIZE);
      await this.postRaw(temporalBatchUrl(this.endpoint, this.authToken), encodeTemporalBatch(batch), {}, 'application/octet-stream');
      signatures.push(...batch.map(signatureFromSerializedTransaction));
    }
    return signatures;
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Temporal;
  }

  minTipSol(): number {
    return MIN_TIP_TEMPORAL;
  }
}

export class TemporalQuicClient extends BaseClient {
  private readonly tipAccounts = TEMPORAL_TIP_ACCOUNTS;

  constructor(
    private readonly rpcUrl: string,
    private readonly endpoint: string,
    private readonly authToken?: string,
  ) {
    super();
  }

  async sendTransaction(tradeType: TradeType, transaction: Buffer, waitConfirmation: boolean): Promise<string> {
    await postTemporalHttp3(temporalBatchUrl(this.endpoint, this.authToken, true), encodeTemporalBatch([transaction]));
    return signatureFromSerializedTransaction(transaction);
  }

  override async sendTransactions(tradeType: TradeType, transactions: Buffer[], waitConfirmation: boolean): Promise<string[]> {
    const signatures: string[] = [];
    for (let start = 0; start < transactions.length; start += TEMPORAL_MAX_BATCH_SIZE) {
      const batch = transactions.slice(start, start + TEMPORAL_MAX_BATCH_SIZE);
      await postTemporalHttp3(temporalBatchUrl(this.endpoint, this.authToken, true), encodeTemporalBatch(batch));
      signatures.push(...batch.map(signatureFromSerializedTransaction));
    }
    return signatures;
  }

  getTipAccount(): string { return randomChoice(this.tipAccounts); }
  getSwqosType(): SwqosType { return SwqosType.Temporal; }
  minTipSol(): number { return MIN_TIP_TEMPORAL; }
}

// ===== FlashBlock Client =====

export class FlashBlockClient extends BaseClient {
  private tipAccounts = FLASH_BLOCK_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      transactions: [encoded],
    };

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['Authorization'] = this.authToken;
    }

    const url = `${this.endpoint}/api/v2/submit-batch`;
    const result = (await this.post(url, payload, headers)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message || String(result.error));
    }

    // Batch submit may return array of results
    if (Array.isArray(result) && result.length > 0) {
      return extractSubmitSignature(result[0], signatureFromSerializedTransaction(transaction), true);
    }

    return extractSubmitSignature(result, signatureFromSerializedTransaction(transaction), true);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.FlashBlock;
  }

  minTipSol(): number {
    return MIN_TIP_FLASH_BLOCK;
  }
}

// ===== Helius Client =====

export class HeliusClient extends BaseClient {
  private tipAccounts = HELIUS_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private apiKey?: string,
    private swqosOnly: boolean = false
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: '1',  // string "1" per Helius API spec
      method: 'sendTransaction',
      params: [
        encoded,
        {
          encoding: 'base64',
          skipPreflight: true,
          maxRetries: 0,
        },
      ],
    };

    const url = appendQuery(this.endpoint, {
      'api-key': this.apiKey,
      swqos_only: this.swqosOnly ? true : undefined,
    });

    const result = (await this.post(url, payload)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message);
    }

    return extractSubmitSignature(result);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Helius;
  }

  minTipSol(): number {
    return this.swqosOnly ? MIN_TIP_HELIUS : MIN_TIP_HELIUS_NORMAL;
  }
}

// ===== Node1 Client =====

export class Node1Client extends BaseClient {
  private tipAccounts = NODE1_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [encoded, { encoding: 'base64', skipPreflight: true }],
    };

    const headers: Record<string, string> = {};
    if (this.authToken) {
      // Header name is 'api-key', not 'Authorization: Bearer'
      headers['api-key'] = this.authToken;
    }

    // endpoint is the full URL (e.g., http://ny.node1.me)
    const result = (await this.post(this.endpoint, payload, headers)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message || String(result.error));
    }

    return extractSubmitSignature(result);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Node1;
  }

  minTipSol(): number {
    return MIN_TIP_NODE1;
  }
}

export class Node1QuicClient implements SwqosClient {
  private readonly tipAccounts = NODE1_TIP_ACCOUNTS;
  private readonly host: string;
  private readonly port: number;

  constructor(
    private readonly rpcUrl: string,
    private readonly endpoint: string,
    private readonly authToken: string,
  ) {
    const lastColon = endpoint.lastIndexOf(':');
    this.host = lastColon >= 0 ? endpoint.slice(0, lastColon) : endpoint;
    this.port = lastColon >= 0 ? parseInt(endpoint.slice(lastColon + 1), 10) : 16666;
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    await sendNode1ViaQUIC(this.host, this.port, this.authToken, new Uint8Array(transaction));
    return signatureFromSerializedTransaction(transaction);
  }

  async sendTransactions(
    tradeType: TradeType,
    transactions: Buffer[],
    waitConfirmation: boolean
  ): Promise<string[]> {
    const signatures: string[] = [];
    for (const tx of transactions) {
      signatures.push(await this.sendTransaction(tradeType, tx, waitConfirmation));
    }
    return signatures;
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Node1;
  }

  minTipSol(): number {
    return MIN_TIP_NODE1;
  }
}

// ===== BlockRazor Client =====

interface BlockRazorBinaryRequest {
  binaryTransaction: Buffer;
  mode: string;
  safeWindow: number;
  revertProtection: boolean;
}

function serializeBlockRazorBinaryRequest(value: BlockRazorBinaryRequest): Buffer {
  const writer = Writer.create()
    .uint32(10).bytes(value.binaryTransaction)
    .uint32(18).string(value.mode)
    .uint32(24).int32(value.safeWindow);
  if (value.revertProtection) writer.uint32(32).bool(true);
  return Buffer.from(writer.finish());
}

function deserializeBlockRazorResponse(buffer: Buffer): { signature: string } {
  const reader = Reader.create(buffer);
  let signature = '';
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    if ((tag >>> 3) === 1) signature = reader.string();
    else reader.skipType(tag & 7);
  }
  return { signature };
}

const blockRazorGrpcDefinition = {
  sendBinaryTransaction: {
    path: '/serverpb.Server/SendBinaryTransaction',
    requestStream: false,
    responseStream: false,
    requestSerialize: serializeBlockRazorBinaryRequest,
    requestDeserialize: () => { throw new Error('client-only method'); },
    responseSerialize: () => { throw new Error('client-only method'); },
    responseDeserialize: deserializeBlockRazorResponse,
    originalName: 'SendBinaryTransaction',
  },
} satisfies grpc.ServiceDefinition;

type BlockRazorGrpcStub = grpc.Client & {
  sendBinaryTransaction(
    request: BlockRazorBinaryRequest,
    metadata: grpc.Metadata,
    options: grpc.CallOptions,
    callback: (error: grpc.ServiceError | null, response: { signature: string }) => void,
  ): grpc.ClientUnaryCall;
};

export class BlockRazorClient extends BaseClient {
  private tipAccounts = BLOCK_RAZOR_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string,
    private mevProtection: boolean = false
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const mode = this.mevProtection ? 'sandwichMitigation' : 'fast';
    const headers: Record<string, string> = {};
    if (this.authToken) headers.apikey = this.authToken;
    const result = await this.post(this.endpoint, {
      transaction: transaction.toString('base64'),
      mode,
      safeWindow: 3,
      revertProtection: false,
    }, headers);
    return extractSubmitSignature(result, signatureFromSerializedTransaction(transaction), true);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.BlockRazor;
  }

  minTipSol(): number {
    return MIN_TIP_BLOCK_RAZOR;
  }
}

export class BlockRazorGrpcClient extends BaseClient {
  private readonly tipAccounts = BLOCK_RAZOR_TIP_ACCOUNTS;
  private readonly client: BlockRazorGrpcStub;

  constructor(
    private readonly rpcUrl: string,
    endpoint: string,
    private readonly authToken?: string,
    private readonly mevProtection = false,
  ) {
    super();
    const ClientConstructor = grpc.makeGenericClientConstructor(blockRazorGrpcDefinition, 'Server') as unknown as new (
      address: string,
      credentials: grpc.ChannelCredentials,
      options?: grpc.ClientOptions,
    ) => BlockRazorGrpcStub;
    const target = endpoint.replace(/^https?:\/\//, '');
    this.client = new ClientConstructor(target, grpc.credentials.createInsecure(), {
      'grpc.keepalive_time_ms': 30_000,
      'grpc.keepalive_timeout_ms': 3_000,
    });
  }

  async sendTransaction(tradeType: TradeType, transaction: Buffer, waitConfirmation: boolean): Promise<string> {
    const metadata = new grpc.Metadata();
    if (this.authToken) metadata.set('apikey', this.authToken);
    const mode = this.mevProtection ? 'sandwichMitigation' : 'fast';
    return new Promise<string>((resolve, reject) => {
      this.client.sendBinaryTransaction({
        binaryTransaction: transaction,
        mode,
        safeWindow: 3,
        revertProtection: false,
      }, metadata, { deadline: Date.now() + 3000 }, (error, response) => {
        if (error) {
          if (error.code === grpc.status.UNAUTHENTICATED) reject(new TradeError(401, error.message, error));
          else if (error.code === grpc.status.PERMISSION_DENIED) reject(new TradeError(403, error.message, error));
          else if (error.code === grpc.status.INVALID_ARGUMENT) reject(new TradeError(400, error.message, error));
          else if (error.code === grpc.status.RESOURCE_EXHAUSTED) reject(new TradeError(429, error.message, error));
          else reject(error);
          return;
        }
        try {
          resolve(extractSubmitSignature(response));
        } catch (parseError) {
          reject(parseError);
        }
      });
    });
  }

  getTipAccount(): string { return randomChoice(this.tipAccounts); }
  getSwqosType(): SwqosType { return SwqosType.BlockRazor; }
  minTipSol(): number { return MIN_TIP_BLOCK_RAZOR; }
}

// ===== Astralane Client =====

export class AstralaneClient extends BaseClient {
  private tipAccounts = ASTRALANE_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const query: Record<string, string | undefined> = { method: 'sendTransaction' };
    if (this.authToken) query['api-key'] = this.authToken;
    const url = appendQuery(this.endpoint, query);

    const result = await this.postRaw(
      url,
      transaction,
      {},
      'application/octet-stream',
    );

    return extractSubmitSignature(result, signatureFromSerializedTransaction(transaction), true);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Astralane;
  }

  minTipSol(): number {
    return MIN_TIP_ASTRALANE;
  }
}

export class AstralaneQuicClient implements SwqosClient {
  private readonly tipAccounts = ASTRALANE_TIP_ACCOUNTS;
  private readonly host: string;
  private readonly port: number;
  private readonly sender: PersistentQuicSender;

  constructor(
    private readonly rpcUrl: string,
    private readonly endpoint: string,
    private readonly authToken: string,
  ) {
    const lastColon = endpoint.lastIndexOf(':');
    this.host = lastColon >= 0 ? endpoint.slice(0, lastColon) : endpoint;
    this.port = lastColon >= 0 ? parseInt(endpoint.slice(lastColon + 1), 10) : 7000;
    this.sender = new PersistentQuicSender(this.host, this.port, 'astralane', {
      alpn: 'astralane-tpu',
      commonName: this.authToken,
      algorithm: 'ecdsa',
    });
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    if (transaction.length > 1232) {
      throw new TradeError(400, `Astralane QUIC transaction too large: ${transaction.length} > 1232`);
    }
    try {
      await this.sender.send(new Uint8Array(transaction));
    } catch (error) {
      if (error instanceof TradeError) throw error;
      const value = error as { errorCode?: unknown; applicationCode?: unknown } | undefined;
      const applicationCode = value?.applicationCode ?? value?.errorCode;
      if (applicationCode === 1 || applicationCode === 1n) {
        throw new TradeError(401, 'Astralane QUIC rejected the API key', error as Error);
      }
      if (applicationCode === 2 || applicationCode === 2n) {
        throw new TradeError(429, 'Astralane QUIC connection limit exceeded', error as Error);
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new TradeError(503, `Astralane QUIC transport error: ${message}`, error as Error);
    }
    return signatureFromSerializedTransaction(transaction);
  }

  async sendTransactions(
    tradeType: TradeType,
    transactions: Buffer[],
    waitConfirmation: boolean
  ): Promise<string[]> {
    const signatures: string[] = [];
    for (const tx of transactions) {
      signatures.push(await this.sendTransaction(tradeType, tx, waitConfirmation));
    }
    return signatures;
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Astralane;
  }

  minTipSol(): number {
    return MIN_TIP_ASTRALANE;
  }
}

// ===== Stellium Client =====

export class StelliumClient extends BaseClient {
  private tipAccounts = STELLIUM_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [encoded, { encoding: 'base64' }],
    };

    // Token is appended directly to path: {endpoint}/{token}
    let url = this.endpoint;
    if (this.authToken) {
      url = `${this.endpoint}/${this.authToken}`;
    }

    const result = (await this.post(url, payload)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message || String(result.error));
    }

    return extractSubmitSignature(result);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Stellium;
  }

  minTipSol(): number {
    return MIN_TIP_STELLIUM;
  }
}

// ===== Lightspeed Client =====

export class LightspeedClient extends BaseClient {
  constructor(
    private rpcUrl: string,
    private customUrl: string  // must be provided, format already contains api_key
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        encoded,
        {
          encoding: 'base64',
          skipPreflight: true,
          preflightCommitment: 'processed',
          maxRetries: 0,
        },
      ],
    };

    // customUrl already contains api_key in its format
    const result = (await this.post(this.customUrl, payload)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message || String(result.error));
    }

    return extractSubmitSignature(result);
  }

  getTipAccount(): string {
    // Lightspeed has 2 tip accounts
    const accounts = [
      '53PhM3UTdMQWu5t81wcd35AHGc5xpmHoRjem7GQPvXjA',
      '9tYF5yPDC1NP8s6diiB3kAX6ZZnva9DM3iDwJkBRarBB',
    ];
    return randomChoice(accounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.Lightspeed;
  }

  minTipSol(): number {
    return MIN_TIP_LIGHTSPEED;
  }
}

// ===== NextBlock Client =====

export class NextBlockClient extends BaseClient {
  private tipAccounts = NEXT_BLOCK_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      transaction: { content: encoded },
      frontRunningProtection: false,
    };

    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['Authorization'] = this.authToken;
    }

    const url = `${this.endpoint}/api/v2/submit`;
    const result = (await this.post(url, payload, headers)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message || String(result.error));
    }
    if (result.reason) {
      throw new TradeError(500, result.reason);
    }

    return extractSubmitSignature(result);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }

  getSwqosType(): SwqosType {
    return SwqosType.NextBlock;
  }

  minTipSol(): number {
    return MIN_TIP_NEXT_BLOCK;
  }
}

// ===== Default RPC Client =====

export class DefaultClient extends BaseClient {
  constructor(private rpcUrl: string) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        encoded,
        { encoding: 'base64' },
      ],
    };

    const result = (await this.post(this.rpcUrl, payload)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message);
    }

    return extractSubmitSignature(result);
  }

  getTipAccount(): string {
    return '';
  }

  getSwqosType(): SwqosType {
    return SwqosType.Default;
  }

  minTipSol(): number {
    return MIN_TIP_DEFAULT;
  }
}

// ===== QUIC helper (Astralane / Soyas / Speedlanding / Solami) =====

/**
 * Send raw transaction bytes via QUIC to a Solana TPU endpoint.
 *
 * Uses @matrixai/quic (ESM-only) via dynamic import so this file stays CJS-
 * compatible. Most Solana TPU providers use self-signed Ed25519 certs with
 * ALPN "solana-tpu"; Astralane uses ECDSA P-256 with ALPN "astralane-tpu".
 *
 * Install optional deps:  npm install @matrixai/quic
 */
interface QuicSenderOptions {
  alpn?: string;
  commonName?: string;
  algorithm?: string;
  key?: string;
  cert?: string;
}

async function createMatrixQuicClient(
  host: string,
  port: number,
  serverName: string,
  options: QuicSenderOptions = {},
): Promise<any> {
  let QUICClient: any;
  try {
    ({ QUICClient } = await import('@matrixai/quic'));
  } catch {
    throw new TradeError(
      501,
      'QUIC not available: run "npm install @matrixai/quic" to enable QUIC SWQOS providers.',
    );
  }

  let key = options.key;
  let cert = options.cert;
  if (!key || !cert) {
    const pems = options.algorithm === 'ecdsa'
      ? await createP256ClientCertificate(options.commonName ?? 'Solana node')
      : await createEd25519ClientCertificate(undefined, options.commonName ?? 'Solana node');
    key = pems.private;
    cert = pems.cert;
  }

  const nodeCrypto = await import('crypto');
  return QUICClient.createQUICClient({
    host,
    port,
    serverName,
    crypto: {
      ops: {
        randomBytes: async (data: ArrayBuffer) => {
          nodeCrypto.randomFillSync(Buffer.from(data));
        },
      },
    },
    config: {
      key,
      cert,
      verifyPeer: false,
      applicationProtos: [options.alpn ?? 'solana-tpu'],
      tlsVersion: 'tlsv13',
      keepAliveIntervalTime: 25_000,
      maxIdleTimeout: 30_000,
    },
  });
}

async function writeMatrixQuicStream(client: any, txBytes: Uint8Array): Promise<void> {
  const stream = client.connection.newStream('uni');
  const writer = stream.writable.getWriter();
  await writer.write(txBytes);
  await writer.close();
}

class PersistentQuicSender {
  private client?: any;
  private connectPromise?: Promise<any>;

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly serverName: string,
    private readonly options: QuicSenderOptions,
  ) {}

  private async connect(): Promise<any> {
    if (this.client) return this.client;
    this.connectPromise ??= createMatrixQuicClient(this.host, this.port, this.serverName, this.options);
    try {
      this.client = await this.connectPromise;
      return this.client;
    } finally {
      this.connectPromise = undefined;
    }
  }

  private async invalidate(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    if (client) {
      try { await client.destroy(); } catch { /* already closed */ }
    }
  }

  async send(txBytes: Uint8Array): Promise<void> {
    try {
      await writeMatrixQuicStream(await this.connect(), txBytes);
    } catch {
      await this.invalidate();
      await writeMatrixQuicStream(await this.connect(), txBytes);
    }
  }
}

async function sendViaQUIC(
  host: string,
  port: number,
  serverName: string,
  txBytes: Uint8Array,
  options: QuicSenderOptions = {},
): Promise<void> {
  const client = await createMatrixQuicClient(host, port, serverName, options);

  try {
    await writeMatrixQuicStream(client, txBytes);
    // Brief delay to allow the stack to flush before closing
    await new Promise(resolve => setTimeout(resolve, 50));
  } finally {
    await client.destroy();
  }
}

async function createEd25519ClientCertificate(
  keypairBytes?: Uint8Array,
  commonName = 'Solana node',
): Promise<{ private: string; cert: string }> {
  const nodeCrypto = await import('crypto');
  const x509 = await import('@peculiar/x509');
  x509.cryptoProvider.set(nodeCrypto.webcrypto as any);

  let keys: any;
  let privateDer: Buffer;
  if (keypairBytes) {
    const seed = Buffer.from(keypairBytes.subarray(0, 32));
    const publicKeyBytes = Buffer.from(keypairBytes.subarray(32, 64));
    privateDer = Buffer.concat([
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      seed,
    ]);
    const publicDer = Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      publicKeyBytes,
    ]);
    keys = {
      privateKey: await nodeCrypto.webcrypto.subtle.importKey(
        'pkcs8',
        privateDer,
        'Ed25519',
        true,
        ['sign'],
      ),
      publicKey: await nodeCrypto.webcrypto.subtle.importKey(
        'spki',
        publicDer,
        'Ed25519',
        true,
        ['verify'],
      ),
    };
  } else {
    keys = await nodeCrypto.webcrypto.subtle.generateKey(
      'Ed25519',
      true,
      ['sign', 'verify'],
    );
    privateDer = Buffer.from(
      await nodeCrypto.webcrypto.subtle.exportKey('pkcs8', keys.privateKey),
    );
  }

  const alg = { name: 'Ed25519' };
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: Buffer.from(nodeCrypto.randomBytes(8)).toString('hex'),
    name: `CN=${commonName}`,
    notBefore: new Date('1975-01-01T00:00:00Z'),
    notAfter: new Date('4096-01-01T00:00:00Z'),
    signingAlgorithm: alg,
    keys,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension(['1.3.6.1.5.5.7.3.2'], false),
      new x509.SubjectAlternativeNameExtension([{ type: 'ip', value: '0.0.0.0' }], false),
    ],
  });
  const privatePem = nodeCrypto.createPrivateKey({
    key: privateDer,
    format: 'der',
    type: 'pkcs8',
  }).export({ format: 'pem', type: 'pkcs8' }) as string;
  return { private: privatePem, cert: cert.toString('pem') };
}

async function createP256ClientCertificate(
  commonName = 'Solana node',
): Promise<{ private: string; cert: string }> {
  const nodeCrypto = await import('crypto');
  const x509 = await import('@peculiar/x509');
  x509.cryptoProvider.set(nodeCrypto.webcrypto as any);

  const keys = await nodeCrypto.webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const privateDer = Buffer.from(
    await nodeCrypto.webcrypto.subtle.exportKey('pkcs8', keys.privateKey),
  );
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: Buffer.from(nodeCrypto.randomBytes(8)).toString('hex'),
    name: `CN=${commonName}`,
    notBefore: new Date(Date.now() - 60 * 60 * 1000),
    notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
    keys,
  });
  const privatePem = nodeCrypto.createPrivateKey({
    key: privateDer,
    format: 'der',
    type: 'pkcs8',
  }).export({ format: 'pem', type: 'pkcs8' }) as string;
  return { private: privatePem, cert: cert.toString('pem') };
}

/** V1 is message-first with trailing signatures; legacy/v0 is signature-first. */
export function signatureFromSerializedTransaction(raw: Buffer | Uint8Array): string {
  const data = Buffer.from(raw);
  if (data[0] === 129) {
    const invalid = () => { throw new TradeError(400, 'Malformed or non-single-signature V1 transaction'); };
    if (data.length < 106 || data.length > 4096 || data[1] !== 1) invalid();
    const mask = data.readUInt32LE(4), count = data.readUInt8(41), instructions = data.readUInt8(40);
    if ((mask & ~31) !== 0 || (mask & 3) === 1 || (mask & 3) === 2 || count < 1 || count > 64 || instructions > 64 || data.readUInt8(2) !== 0 || data.readUInt8(3) > count - 1) invalid();
    let offset = 42 + count * 32 + ((mask & 3) ? 8 : 0) + ((mask & 4) ? 4 : 0) + ((mask & 8) ? 4 : 0) + ((mask & 16) ? 4 : 0);
    const headers = offset;
    offset += instructions * 4;
    if (offset > data.length - 64) invalid();
    const unique=new Set<string>();
    for(let i=0;i<count;i++){const key=data.subarray(42+i*32,74+i*32).toString('hex');if(unique.has(key))invalid();unique.add(key);}
    if(mask&16){const heap=data.readUInt32LE(headers-4);if(heap<32768||heap>262144||heap%1024)invalid();}
    for (let i = 0; i < instructions; i++) {
      const h = headers + i * 4, accounts = data.readUInt8(h + 1);
      if (data.readUInt8(h) === 0 || data.readUInt8(h) >= count || offset + accounts > data.length - 64) invalid();
      for (let j = 0; j < accounts; j++) if (data.readUInt8(offset + j) >= count) invalid();
      offset += accounts + data.readUInt16LE(h + 2);
      if (offset > data.length - 64) invalid();
    }
    if (offset !== data.length - 64) invalid();
    return bs58.encode(data.subarray(offset, offset + 64));
  }
  if (data[0] !== 1 || data.length < 65) {
    throw new TradeError(400, 'Only single-signature transactions are supported for SWQOS submit');
  }
  return bs58.encode(data.subarray(1, 65));
}

function solanaKeypairSecretFromBase58(apiKey?: string): Uint8Array {
  if (!apiKey) {
    throw new TradeError(400, 'Solami api token is required and must be a base58-encoded Solana keypair');
  }
  let decoded: Uint8Array;
  try {
    decoded = bs58.decode(apiKey.trim());
  } catch (e) {
    throw new TradeError(400, `Solami api token base58 decode failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (decoded.length !== 64) {
    throw new TradeError(400, `Solami api token must decode to 64 bytes, got ${decoded.length}`);
  }
  return decoded;
}

async function solamiClientCertificate(apiKey?: string): Promise<{ key: string; cert: string }> {
  const pems = await createEd25519ClientCertificate(solanaKeypairSecretFromBase58(apiKey));
  return { key: pems.private, cert: pems.cert };
}

function hostPortFromHttp(endpoint: string, port: number): { host: string; port: number } {
  try {
    const url = new URL(endpoint);
    return { host: url.hostname, port };
  } catch {
    const withoutScheme = endpoint.replace(/^https?:\/\//, '').split('/')[0]!;
    const lastColon = withoutScheme.lastIndexOf(':');
    const host = lastColon >= 0 ? withoutScheme.slice(0, lastColon) : withoutScheme;
    return { host, port };
  }
}

function uuidToBytes(apiKey: string): Uint8Array {
  const hex = apiKey.replace(/-/g, '');
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new TradeError(400, 'Node1 QUIC API key must be a UUID');
  }
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

async function readQuicStream(stream: any): Promise<Uint8Array> {
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        const chunk = new Uint8Array(value);
        chunks.push(chunk);
        total += chunk.length;
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function sendNode1ViaQUIC(
  host: string,
  port: number,
  apiKey: string,
  txBytes: Uint8Array,
): Promise<void> {
  let QUICClient: any;
  try {
    ({ QUICClient } = await import('@matrixai/quic'));
  } catch {
    throw new TradeError(501, 'QUIC not available: run "npm install @matrixai/quic" to enable Node1 QUIC.');
  }
  if (txBytes.length > 1232) {
    throw new TradeError(400, `Node1 QUIC transaction too large: ${txBytes.length} > 1232`);
  }

  const client = await QUICClient.createQUICClient({
    host,
    port,
    config: {
      verifyPeer: false,
      applicationProtos: ['h3'],
      tlsVersion: 'tlsv13',
      serverName: host,
    },
  });

  try {
    const authStream = client.connection.newStream('bi');
    const authWriter = authStream.writable.getWriter();
    await authWriter.write(uuidToBytes(apiKey));
    await authWriter.close();
    const authReply = await readQuicStream(authStream);
    if (authReply[0] !== 0) {
      throw new TradeError(401, `Node1 QUIC auth rejected: ${authReply[0] ?? -1}`);
    }

    const txStream = client.connection.newStream('bi');
    const txWriter = txStream.writable.getWriter();
    await txWriter.write(txBytes);
    await txWriter.close();
    const response = await readQuicStream(txStream);
    if (response.length < 6) {
      throw new TradeError(500, 'Node1 QUIC response too short');
    }
    const status = (response[0]! << 8) | response[1]!;
    const msgLen = (response[2]! << 24) | (response[3]! << 16) | (response[4]! << 8) | response[5]!;
    const msg = Buffer.from(response.slice(6, 6 + msgLen)).toString('utf8');
    if (status !== 200) {
      throw new TradeError(status, `Node1 QUIC submit failed: ${msg}`);
    }
  } finally {
    await client.destroy();
  }
}

// ===== Soyas Client =====

/**
 * Soyas SWQOS client.
 *
 * Transport: QUIC with self-signed Ed25519 cert, ALPN "solana-tpu".
 * Endpoint:  host:port (e.g. nyc.landing.soyas.xyz:9000)
 * SNI:       "soyas-landing" (matches Rust SDK SOYAS_SERVER constant)
 * Requires:  npm install @matrixai/quic selfsigned
 */
export class SoyasClient implements SwqosClient {
  private readonly tipAccount: string;
  private readonly host: string;
  private readonly port: number;

  constructor(
    private readonly rpcUrl: string,
    private readonly endpoint: string,
    private readonly apiKey?: string,
  ) {
    this.tipAccount = randomChoice(SOYAS_TIP_ACCOUNTS);
    const parts = endpoint.split(':');
    this.host = parts.slice(0, -1).join(':') || endpoint;
    this.port = parts.length > 1 ? parseInt(parts[parts.length - 1]!, 10) : 9000;
  }

  async sendTransaction(
    _tradeType: TradeType,
    transaction: Buffer,
    _waitConfirmation: boolean,
  ): Promise<string> {
    await sendViaQUIC(this.host, this.port, 'soyas-landing', new Uint8Array(transaction));
    return signatureFromSerializedTransaction(transaction);
  }

  async sendTransactions(
    tradeType: TradeType,
    transactions: Buffer[],
    waitConfirmation: boolean,
  ): Promise<string[]> {
    for (const tx of transactions) {
      await this.sendTransaction(tradeType, tx, waitConfirmation);
    }
    return transactions.map(tx => signatureFromSerializedTransaction(tx));
  }

  getTipAccount(): string { return this.tipAccount; }
  getSwqosType(): SwqosType { return SwqosType.Soyas; }
  minTipSol(): number { return MIN_TIP_SOYAS; }
}

// ===== Speedlanding Client =====

/**
 * Speedlanding SWQOS client.
 *
 * Transport: QUIC with self-signed Ed25519 cert, ALPN "solana-tpu".
 * Endpoint:  host:port (e.g. nyc.speedlanding.trade:17778)
 * SNI:       fixed "speed-landing" to match Rust SDK behavior.
 * Requires:  npm install @matrixai/quic selfsigned
 */
export class SpeedlandingClient implements SwqosClient {
  private readonly tipAccount: string;
  private readonly host: string;
  private readonly port: number;
  private readonly serverName: string;

  constructor(
    private readonly rpcUrl: string,
    private readonly endpoint: string,
    private readonly apiKey?: string,
  ) {
    this.tipAccount = randomChoice(SPEEDLANDING_TIP_ACCOUNTS);
    const lastColon = endpoint.lastIndexOf(':');
    this.host = lastColon >= 0 ? endpoint.slice(0, lastColon) : endpoint;
    this.port = lastColon >= 0 ? parseInt(endpoint.slice(lastColon + 1), 10) : 17778;
    // Kept for compatibility with existing private fields; submit uses the Rust fixed SNI.
    this.serverName = /^\d+\.\d+\.\d+\.\d+$/.test(this.host) ? 'speed-landing' : this.host;
  }

  async sendTransaction(
    _tradeType: TradeType,
    transaction: Buffer,
    _waitConfirmation: boolean,
  ): Promise<string> {
    await sendViaQUIC(this.host, this.port, 'speed-landing', new Uint8Array(transaction));
    return signatureFromSerializedTransaction(transaction);
  }

  async sendTransactions(
    tradeType: TradeType,
    transactions: Buffer[],
    waitConfirmation: boolean,
  ): Promise<string[]> {
    for (const tx of transactions) {
      await this.sendTransaction(tradeType, tx, waitConfirmation);
    }
    return transactions.map(tx => signatureFromSerializedTransaction(tx));
  }

  getTipAccount(): string { return this.tipAccount; }
  getSwqosType(): SwqosType { return SwqosType.Speedlanding; }
  minTipSol(): number { return MIN_TIP_SPEEDLANDING; }
}

// ===== Solami Client =====

/**
 * Solami SWQOS client.
 *
 * Transport: QUIC with ALPN "solana-tpu".
 * Endpoint:  host:port (Rust default: beam.solami.dev:11000)
 * SNI:       "solami-beam" (Rust SDK SOLAMI_SERVER constant)
 */
export class SolamiClient implements SwqosClient {
  private readonly tipAccount: string;
  private readonly host: string;
  private readonly port: number;

  constructor(
    private readonly rpcUrl: string,
    private readonly endpoint: string,
    private readonly apiKey?: string,
  ) {
    this.tipAccount = randomChoice(SOLAMI_TIP_ACCOUNTS);
    const lastColon = endpoint.lastIndexOf(':');
    this.host = lastColon >= 0 ? endpoint.slice(0, lastColon) : endpoint;
    this.port = lastColon >= 0 ? parseInt(endpoint.slice(lastColon + 1), 10) : 11000;
  }

  async sendTransaction(
    _tradeType: TradeType,
    transaction: Buffer,
    _waitConfirmation: boolean,
  ): Promise<string> {
    const pems = await solamiClientCertificate(this.apiKey);
    await sendViaQUIC(this.host, this.port, 'solami-beam', new Uint8Array(transaction), pems);
    return signatureFromSerializedTransaction(transaction);
  }

  async sendTransactions(
    tradeType: TradeType,
    transactions: Buffer[],
    waitConfirmation: boolean,
  ): Promise<string[]> {
    for (const tx of transactions) {
      await this.sendTransaction(tradeType, tx, waitConfirmation);
    }
    return transactions.map(tx => signatureFromSerializedTransaction(tx));
  }

  getTipAccount(): string { return this.tipAccount; }
  getSwqosType(): SwqosType { return SwqosType.Solami; }
  minTipSol(): number { return MIN_TIP_SOLAMI; }
}

function parseHostPort(endpoint: string, defaultPort: number): { host: string; port: number } {
  if (/^https?:\/\//.test(endpoint)) {
    return hostPortFromHttp(endpoint, defaultPort);
  }
  const lastColon = endpoint.lastIndexOf(':');
  return {
    host: lastColon >= 0 ? endpoint.slice(0, lastColon) : endpoint,
    port: lastColon >= 0 ? parseInt(endpoint.slice(lastColon + 1), 10) : defaultPort,
  };
}

function validateGlaiveUuid(apiKey: string): Uint8Array {
  const trimmed = apiKey.trim();
  const match = /^([0-9a-fA-F]{8})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-([0-9a-fA-F]{4})-([0-9a-fA-F]{12})$/.exec(trimmed);
  if (!match) {
    throw new TradeError(400, 'Glaive API key must be a valid UUID v4');
  }
  const hex = match.slice(1).join('');
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  if ((bytes[6]! >> 4) !== 4) {
    throw new TradeError(400, 'Glaive API key must be a UUID v4');
  }
  return bytes;
}

export function buildGlaiveBinaryUrl(endpoint: string, apiKey: string, mevProtection: boolean): string {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TradeError(400, 'Glaive HTTP endpoint must use http or https');
  }
  let path = url.pathname.replace(/\/$/, '');
  if (!path.endsWith('/binary')) {
    path = path === '' || path === '/' ? '/binary' : `${path}/binary`;
  }
  url.pathname = path;
  url.searchParams.delete('api-key');
  url.searchParams.delete('mev-protect');
  url.searchParams.set('api-key', apiKey.trim());
  if (mevProtection) {
    url.searchParams.set('mev-protect', 'true');
  }
  return url.toString();
}

function buildGlaiveAuthFrame(apiKey: string, mevProtection: boolean): Uint8Array {
  const uuidBytes = validateGlaiveUuid(apiKey);
  const frame = new Uint8Array(17);
  frame.set(uuidBytes, 0);
  frame[16] = mevProtection ? 1 : 0;
  return frame;
}

// ===== LunarLander Client =====

export class LunarLanderClient extends BaseClient {
  private tipAccounts = LUNARLANDER_TIP_ACCOUNTS;

  constructor(
    private rpcUrl: string,
    private endpoint: string,
    private authToken?: string
  ) {
    super();
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const url = `${this.endpoint.replace(/\/$/, '')}/send-bin`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-api-key': this.authToken || '',
      },
      body: transaction,
    });
    if (!response.ok) {
      throw new TradeError(response.status, `LunarLander sendTransaction failed: ${response.status}`);
    }
    await response.arrayBuffer();
    return signatureFromSerializedTransaction(transaction);
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }
  getSwqosType(): SwqosType {
    return SwqosType.LunarLander;
  }
  minTipSol(): number {
    return MIN_TIP_LUNARLANDER;
  }
}

export class LunarLanderQuicClient implements SwqosClient {
  private readonly tipAccounts = LUNARLANDER_TIP_ACCOUNTS;
  private readonly host: string;
  private readonly port: number;

  constructor(
    private readonly rpcUrl: string,
    endpoint: string,
    private readonly apiKey: string,
    private readonly mevProtection: boolean = false
  ) {
    const parsed = parseHostPort(endpoint, 16888);
    this.host = parsed.host;
    this.port = parsed.port;
  }

  async sendTransaction(
    _tradeType: TradeType,
    transaction: Buffer,
    _waitConfirmation: boolean
  ): Promise<string> {
    if (transaction.length > 1232) {
      throw new TradeError(400, `LunarLander QUIC transaction too large: ${transaction.length} > 1232`);
    }
    // Client-cert CN = API key; ALPN lunar-lander-tpu (Rust lunar_lander_quic_client parity).
    await sendViaQUIC(this.host, this.port, this.host, new Uint8Array(transaction), {
      alpn: 'lunar-lander-tpu',
      commonName: this.apiKey,
      algorithm: 'ecdsa',
    });
    return signatureFromSerializedTransaction(transaction);
  }

  async sendTransactions(
    tradeType: TradeType,
    transactions: Buffer[],
    waitConfirmation: boolean
  ): Promise<string[]> {
    for (const tx of transactions) {
      await this.sendTransaction(tradeType, tx, waitConfirmation);
    }
    return transactions.map((tx) => signatureFromSerializedTransaction(tx));
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }
  getSwqosType(): SwqosType {
    return SwqosType.LunarLander;
  }
  minTipSol(): number {
    return MIN_TIP_LUNARLANDER;
  }
}

// ===== Glaive Client =====

export class GlaiveClient extends BaseClient {
  private tipAccounts = GLAIVE_TIP_ACCOUNTS;
  private submitUrl: string;

  constructor(
    private rpcUrl: string,
    endpoint: string,
    apiKey: string,
    mevProtection: boolean = false
  ) {
    super();
    validateGlaiveUuid(apiKey);
    this.submitUrl = buildGlaiveBinaryUrl(endpoint, apiKey, mevProtection);
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    const expected = signatureFromSerializedTransaction(transaction);
    const response = await fetch(this.submitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: transaction,
    });
    const text = await response.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new TradeError(500, `Glaive returned HTTP ${response.status} with invalid JSON: ${text.slice(0, 512)}`);
    }
    if (json?.error) {
      const message = json.error?.message || json.error || 'unknown Glaive error';
      const code = json.error?.code;
      throw new TradeError(
        typeof code === 'number' ? code : 500,
        typeof code === 'number'
          ? `Glaive rejected transaction: code=${code} message=${message}`
          : `Glaive rejected transaction: ${message}`
      );
    }
    if (!response.ok) {
      throw new TradeError(response.status, `Glaive returned HTTP ${response.status}: ${text.slice(0, 512)}`);
    }
    if (!json?.result || json.result !== expected) {
      throw new TradeError(500, 'Glaive returned a signature that does not match the submitted transaction');
    }
    return expected;
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }
  getSwqosType(): SwqosType {
    return SwqosType.Glaive;
  }
  minTipSol(): number {
    return MIN_TIP_GLAIVE;
  }
}

export class GlaiveQuicClient implements SwqosClient {
  private readonly tipAccounts = GLAIVE_TIP_ACCOUNTS;
  private readonly host: string;
  private readonly port: number;
  private readonly authFrame: Uint8Array;

  constructor(
    private readonly rpcUrl: string,
    endpoint: string,
    apiKey: string,
    mevProtection: boolean = false
  ) {
    const parsed = parseHostPort(endpoint, 4000);
    this.host = parsed.host;
    this.port = parsed.port;
    this.authFrame = buildGlaiveAuthFrame(apiKey, mevProtection);
  }

  async sendTransaction(
    _tradeType: TradeType,
    transaction: Buffer,
    _waitConfirmation: boolean
  ): Promise<string> {
    if (transaction.length > 1232) {
      throw new TradeError(400, `Glaive QUIC transaction too large: ${transaction.length} > 1232`);
    }
    await sendGlaiveViaQUIC(this.host, this.port, this.authFrame, new Uint8Array(transaction));
    return signatureFromSerializedTransaction(transaction);
  }

  async sendTransactions(
    tradeType: TradeType,
    transactions: Buffer[],
    waitConfirmation: boolean
  ): Promise<string[]> {
    for (const tx of transactions) {
      await this.sendTransaction(tradeType, tx, waitConfirmation);
    }
    return transactions.map((tx) => signatureFromSerializedTransaction(tx));
  }

  getTipAccount(): string {
    return randomChoice(this.tipAccounts);
  }
  getSwqosType(): SwqosType {
    return SwqosType.Glaive;
  }
  minTipSol(): number {
    return MIN_TIP_GLAIVE;
  }
}

async function sendGlaiveViaQUIC(
  host: string,
  port: number,
  authFrame: Uint8Array,
  txBytes: Uint8Array
): Promise<void> {
  const client = await createMatrixQuicClient(host, port, 'glaive-intake', {
    alpn: 'solana-tpu',
  });
  try {
    const authStream = client.connection.newStream('uni');
    const authWriter = authStream.writable.getWriter();
    await authWriter.write(authFrame);
    await authWriter.close();
    await writeMatrixQuicStream(client, txBytes);
    await new Promise((resolve) => setTimeout(resolve, 50));
  } finally {
    await client.destroy().catch(() => undefined);
  }
}

// ===== Client Factory =====

export interface SwqosClientConfig {
  type: SwqosType;
  region?: SwqosRegion;
  customUrl?: string;
  apiKey?: string;
  mevProtection?: boolean;
  transport?: SwqosTransport;
  astralaneTransport?: AstralaneTransport;
  swqosOnly?: boolean;
}

export class ClientFactory {
  static createClient(config: SwqosClientConfig, rpcUrl: string): SwqosClient {
    if (isSwqosTypeBlacklisted(config.type)) {
      throw new TradeError(
        400,
        `SWQOS type is blacklisted by Rust v5.0.2 parity: ${config.type}`
      );
    }
    const region = config.region ?? SwqosRegion.Default;

    switch (config.type) {
      case SwqosType.Jito: {
        const endpoint = config.customUrl || JITO_ENDPOINTS[region];
        return new JitoClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Bloxroute: {
        const endpoint = config.customUrl || BLOXROUTE_ENDPOINTS[region];
        return new BloxrouteClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.ZeroSlot: {
        const endpoint = config.customUrl || ZERO_SLOT_ENDPOINTS[region];
        return new ZeroSlotClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Temporal: {
        const endpoint = config.customUrl || TEMPORAL_ENDPOINTS[region];
        if (config.customUrl && config.transport === undefined) {
          return new TemporalClient(rpcUrl, endpoint, config.apiKey);
        }
        if (config.transport === SwqosTransport.Http) {
          return new TemporalClient(rpcUrl, endpoint, config.apiKey);
        }
        if (config.transport === SwqosTransport.Grpc) {
          throw new TradeError(400, 'Temporal does not provide a gRPC transaction-submission API');
        }
        const quic = new TemporalQuicClient(rpcUrl, endpoint, config.apiKey);
        if (config.transport === SwqosTransport.Quic) return quic;
        return new FallbackSwqosClient(quic, new TemporalClient(rpcUrl, endpoint, config.apiKey));
      }

      case SwqosType.FlashBlock: {
        const endpoint = config.customUrl || FLASH_BLOCK_ENDPOINTS[region];
        return new FlashBlockClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Helius: {
        const endpoint = config.customUrl || HELIUS_ENDPOINTS[region];
        return new HeliusClient(rpcUrl, endpoint, config.apiKey, config.swqosOnly ?? false);
      }

      case SwqosType.Node1: {
        const endpoint = config.customUrl || NODE1_ENDPOINTS[region];
        if (config.transport === SwqosTransport.Quic) {
          const parsed = /^https?:\/\//.test(endpoint)
            ? hostPortFromHttp(endpoint, 16666)
            : (() => {
                const lastColon = endpoint.lastIndexOf(':');
                return {
                  host: lastColon >= 0 ? endpoint.slice(0, lastColon) : endpoint,
                  port: lastColon >= 0 ? parseInt(endpoint.slice(lastColon + 1), 10) : 16666,
                };
              })();
          return new Node1QuicClient(rpcUrl, `${parsed.host}:${parsed.port}`, config.apiKey || '');
        }
        return new Node1Client(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.BlockRazor: {
        const httpEndpoint = config.customUrl || BLOCK_RAZOR_ENDPOINTS[region];
        if (config.customUrl && config.transport === undefined) {
          return new BlockRazorClient(rpcUrl, httpEndpoint, config.apiKey, config.mevProtection ?? false);
        }
        if (config.transport === SwqosTransport.Http) {
          return new BlockRazorClient(rpcUrl, httpEndpoint, config.apiKey, config.mevProtection ?? false);
        }
        if (config.transport === SwqosTransport.Quic) {
          throw new TradeError(400, 'BlockRazor does not provide a QUIC transaction-submission API');
        }
        const grpcEndpoint = config.customUrl || BLOCK_RAZOR_GRPC_ENDPOINTS[region];
        const grpcClient = new BlockRazorGrpcClient(rpcUrl, grpcEndpoint, config.apiKey, config.mevProtection ?? false);
        if (config.transport === SwqosTransport.Grpc) return grpcClient;
        return new FallbackSwqosClient(
          grpcClient,
          new BlockRazorClient(rpcUrl, httpEndpoint, config.apiKey, config.mevProtection ?? false),
        );
      }

      case SwqosType.Astralane: {
        const baseEndpoint = config.customUrl || ASTRALANE_ENDPOINTS[region];
        if (config.customUrl && config.astralaneTransport === undefined) {
          return new AstralaneClient(rpcUrl, baseEndpoint, config.apiKey);
        }
        if (config.astralaneTransport === AstralaneTransport.Quic) {
          let endpoint: string;
          const port = config.mevProtection ? 9000 : 7000;
          if (config.customUrl) {
            if (/^https?:\/\//.test(config.customUrl)) {
              const parsed = hostPortFromHttp(config.customUrl, port);
              endpoint = `${parsed.host}:${parsed.port}`;
            } else {
              endpoint = config.customUrl;
            }
          } else {
            endpoint = `${ASTRALANE_QUIC_HOSTS[region]}:${port}`;
          }
          return new AstralaneQuicClient(rpcUrl, endpoint, config.apiKey || '');
        }
        const endpoint =
          config.astralaneTransport === AstralaneTransport.Plain
            ? baseEndpoint.replace('/irisb', '/iris')
            : baseEndpoint;
        if (config.astralaneTransport === undefined) {
          const port = config.mevProtection ? 9000 : 7000;
          return new FallbackSwqosClient(
            new AstralaneQuicClient(rpcUrl, `${ASTRALANE_QUIC_HOSTS[region]}:${port}`, config.apiKey || ''),
            new AstralaneClient(rpcUrl, endpoint, config.apiKey),
          );
        }
        return new AstralaneClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Stellium: {
        const endpoint = config.customUrl || STELLIUM_ENDPOINTS[region];
        return new StelliumClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Lightspeed: {
        if (!config.customUrl) {
          throw new TradeError(400, 'LightspeedClient requires customUrl (format already contains api_key)');
        }
        return new LightspeedClient(rpcUrl, config.customUrl);
      }

      case SwqosType.NextBlock: {
        const endpoint = config.customUrl || NEXT_BLOCK_ENDPOINTS[region];
        return new NextBlockClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Soyas: {
        const endpoint = config.customUrl || SOYAS_ENDPOINTS[region];
        return new SoyasClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Speedlanding: {
        const endpoint = config.customUrl || SPEEDLANDING_ENDPOINTS[region];
        return new SpeedlandingClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Solami: {
        const endpoint = config.customUrl || SOLAMI_ENDPOINTS[region];
        return new SolamiClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.LunarLander: {
        if (config.transport === SwqosTransport.Grpc) {
          throw new TradeError(400, 'LunarLander does not support the gRPC transport');
        }
        const useQuic = config.transport === undefined || config.transport === SwqosTransport.Quic;
        if (useQuic) {
          let endpoint = config.customUrl || LUNARLANDER_QUIC_ENDPOINTS[region];
          if (config.customUrl && /^https?:\/\//.test(config.customUrl)) {
            const parsed = hostPortFromHttp(config.customUrl, 16888);
            endpoint = `${parsed.host}:${parsed.port}`;
          }
          return new LunarLanderQuicClient(rpcUrl, endpoint, config.apiKey || '', config.mevProtection ?? false);
        }
        const endpoint = config.customUrl || LUNARLANDER_ENDPOINTS[region];
        return new LunarLanderClient(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.Glaive: {
        const transport = config.transport ?? SwqosTransport.Quic;
        if (transport === SwqosTransport.Grpc) {
          throw new TradeError(400, 'Glaive does not support the gRPC transport');
        }
        if (transport === SwqosTransport.Quic) {
          let endpoint = config.customUrl || GLAIVE_QUIC_ENDPOINTS[region];
          if (config.customUrl && /^https?:\/\//.test(config.customUrl)) {
            const parsed = hostPortFromHttp(config.customUrl, 4000);
            endpoint = `${parsed.host}:${parsed.port}`;
          }
          return new GlaiveQuicClient(rpcUrl, endpoint, config.apiKey || '', config.mevProtection ?? false);
        }
        const endpoint = config.customUrl || GLAIVE_ENDPOINTS[region];
        return new GlaiveClient(rpcUrl, endpoint, config.apiKey || '', config.mevProtection ?? false);
      }

      case SwqosType.Default:
        return new DefaultClient(rpcUrl);

      default:
        throw new TradeError(
          400,
          `Unsupported SWQOS type for Rust v5.0.2 trading path: ${config.type}`
        );
    }
  }
}

// ===== Convenience Function =====

export function createSwqosClient(
  swqosType: SwqosType,
  rpcUrl: string,
  authToken?: string,
  region?: SwqosRegion,
  customUrl?: string,
  mevProtection: boolean = false
): SwqosClient {
  const config: SwqosClientConfig = {
    type: swqosType,
    region,
    customUrl,
    apiKey: authToken,
    mevProtection,
  };
  return ClientFactory.createClient(config, rpcUrl);
}
