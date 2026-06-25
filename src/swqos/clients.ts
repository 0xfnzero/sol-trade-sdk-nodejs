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
  [SwqosRegion.NewYork]: 'http://newyork.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.Frankfurt]: 'http://frankfurt.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.Amsterdam]: 'http://amsterdam.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.Dublin]: 'http://london.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.SLC]: 'http://newyork.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.Tokyo]: 'http://tokyo.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.London]: 'http://london.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.LosAngeles]: 'http://newyork.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.Singapore]: 'http://tokyo.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.Default]: 'http://frankfurt.solana.blockrazor.xyz:443/v2/sendTransaction',
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
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [encoded, { encoding: 'base64' }],
    };

    // Auth in URL param ?c=token, no Authorization header
    let url = this.endpoint;
    if (this.authToken) {
      url = `${this.endpoint}/?c=${this.authToken}`;
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
    return SwqosType.Temporal;
  }

  minTipSol(): number {
    return MIN_TIP_TEMPORAL;
  }
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
    const encoded = transaction.toString('base64');

    const mode = this.mevProtection ? 'sandwichMitigation' : 'fast';
    // Auth in URL param ?auth=token&mode=...
    let url = `${this.endpoint}?mode=${mode}`;
    if (this.authToken) {
      url = `${this.endpoint}?auth=${this.authToken}&mode=${mode}`;
    }

    // Body is raw base64 string, Content-Type: text/plain. BlockRazor HTTP
    // commonly returns the signature as plain text rather than JSON.
    const result = (await this.postRaw(url, encoded)) as any;
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

  constructor(
    private readonly rpcUrl: string,
    private readonly endpoint: string,
    private readonly authToken: string,
  ) {
    const lastColon = endpoint.lastIndexOf(':');
    this.host = lastColon >= 0 ? endpoint.slice(0, lastColon) : endpoint;
    this.port = lastColon >= 0 ? parseInt(endpoint.slice(lastColon + 1), 10) : 7000;
  }

  async sendTransaction(
    tradeType: TradeType,
    transaction: Buffer,
    waitConfirmation: boolean
  ): Promise<string> {
    if (transaction.length > 1232) {
      throw new TradeError(400, `Astralane QUIC transaction too large: ${transaction.length} > 1232`);
    }
    await sendViaQUIC(this.host, this.port, 'astralane', new Uint8Array(transaction), {
      alpn: 'astralane-tpu',
      commonName: this.authToken,
      algorithm: 'ecdsa',
    });
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
async function sendViaQUIC(
  host: string,
  port: number,
  serverName: string,
  txBytes: Uint8Array,
  options: {
    alpn?: string;
    commonName?: string;
    algorithm?: string;
    key?: string;
    cert?: string;
  } = {},
): Promise<void> {
  // Dynamic imports so the file compiles/runs even without the optional packages
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

  const client = await QUICClient.createQUICClient({
    host,
    port,
    config: {
      key,
      cert,
      verifyPeer: false,
      applicationProtos: [options.alpn ?? 'solana-tpu'],
      tlsVersion: 'tlsv13',
      serverName,
    },
  });

  try {
    const stream = client.connection.newStream('uni');
    const writer = stream.writable.getWriter();
    await writer.write(txBytes);
    await writer.close();
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

function signatureFromSerializedTransaction(raw: Buffer | Uint8Array): string {
  const data = raw instanceof Buffer ? raw : Buffer.from(raw);
  const signatureCount = data[0] ?? 0;
  if (signatureCount !== 1 || data.length < 65) {
    throw new TradeError(400, 'Only single-signature versioned transactions are supported for SWQOS submit');
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
        `SWQOS type is blacklisted by Rust v4.0.21 parity: ${config.type}`
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
        return new TemporalClient(rpcUrl, endpoint, config.apiKey);
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
        const endpoint = config.customUrl || BLOCK_RAZOR_ENDPOINTS[region];
        return new BlockRazorClient(rpcUrl, endpoint, config.apiKey, config.mevProtection ?? false);
      }

      case SwqosType.Astralane: {
        const baseEndpoint = config.customUrl || ASTRALANE_ENDPOINTS[region];
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

      case SwqosType.Default:
        return new DefaultClient(rpcUrl);

      default:
        throw new TradeError(
          400,
          `Unsupported SWQOS type for Rust v4.0.21 trading path: ${config.type}`
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
