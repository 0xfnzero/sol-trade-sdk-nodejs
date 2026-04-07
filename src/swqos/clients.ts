/**
 * SWQOS Clients for Sol Trade SDK
 * Implements various SWQOS (Solana Write Queue Operating System) providers.
 */

import { SwqosType, SwqosRegion, TradeType, TradeError } from '../index';

// ===== Utility =====

export function randomChoice<T>(arr: T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)];
  if (item === undefined) {
    throw new Error('randomChoice called with empty array');
  }
  return item;
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
export const MIN_TIP_DEFAULT = 0.0;

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

// ===== Region Endpoint Maps =====

export const JITO_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'https://ny.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Frankfurt]: 'https://frankfurt.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Amsterdam]: 'https://amsterdam.mainnet.block-engine.jito.wtf',
  [SwqosRegion.SLC]: 'https://slc.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Tokyo]: 'https://tokyo.mainnet.block-engine.jito.wtf',
  [SwqosRegion.London]: 'https://london.mainnet.block-engine.jito.wtf',
  [SwqosRegion.LosAngeles]: 'https://ny.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Singapore]: 'https://amsterdam.mainnet.block-engine.jito.wtf',
  [SwqosRegion.Default]: 'https://mainnet.block-engine.jito.wtf',
};

export const BLOXROUTE_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'https://ny.solana.dex.blxrbdn.com',
  [SwqosRegion.Frankfurt]: 'https://germany.solana.dex.blxrbdn.com',
  [SwqosRegion.Amsterdam]: 'https://amsterdam.solana.dex.blxrbdn.com',
  [SwqosRegion.SLC]: 'https://ny.solana.dex.blxrbdn.com',
  [SwqosRegion.Tokyo]: 'https://tokyo.solana.dex.blxrbdn.com',
  [SwqosRegion.London]: 'https://uk.solana.dex.blxrbdn.com',
  [SwqosRegion.LosAngeles]: 'https://la.solana.dex.blxrbdn.com',
  [SwqosRegion.Singapore]: 'https://global.solana.dex.blxrbdn.com',
  [SwqosRegion.Default]: 'https://global.solana.dex.blxrbdn.com',
};

export const ZERO_SLOT_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ny.0slot.trade',
  [SwqosRegion.Frankfurt]: 'http://de2.0slot.trade',
  [SwqosRegion.Amsterdam]: 'http://ams.0slot.trade',
  [SwqosRegion.SLC]: 'http://ny.0slot.trade',
  [SwqosRegion.Tokyo]: 'http://jp.0slot.trade',
  [SwqosRegion.London]: 'http://ams.0slot.trade',
  [SwqosRegion.LosAngeles]: 'http://la.0slot.trade',
  [SwqosRegion.Singapore]: 'http://de2.0slot.trade',
  [SwqosRegion.Default]: 'http://de2.0slot.trade',
};

export const TEMPORAL_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ewr1.nozomi.temporal.xyz',
  [SwqosRegion.Frankfurt]: 'http://fra2.nozomi.temporal.xyz',
  [SwqosRegion.Amsterdam]: 'http://ams1.nozomi.temporal.xyz',
  [SwqosRegion.SLC]: 'http://ewr1.nozomi.temporal.xyz',
  [SwqosRegion.Tokyo]: 'http://tyo1.nozomi.temporal.xyz',
  [SwqosRegion.London]: 'http://sgp1.nozomi.temporal.xyz',
  [SwqosRegion.LosAngeles]: 'http://pit1.nozomi.temporal.xyz',
  [SwqosRegion.Singapore]: 'http://fra2.nozomi.temporal.xyz',
  [SwqosRegion.Default]: 'http://fra2.nozomi.temporal.xyz',
};

export const FLASH_BLOCK_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ny.flashblock.trade',
  [SwqosRegion.Frankfurt]: 'http://fra.flashblock.trade',
  [SwqosRegion.Amsterdam]: 'http://ams.flashblock.trade',
  [SwqosRegion.SLC]: 'http://slc.flashblock.trade',
  [SwqosRegion.Tokyo]: 'http://singapore.flashblock.trade',
  [SwqosRegion.London]: 'http://london.flashblock.trade',
  [SwqosRegion.LosAngeles]: 'http://ny.flashblock.trade',
  [SwqosRegion.Singapore]: 'http://singapore.flashblock.trade',
  [SwqosRegion.Default]: 'http://ny.flashblock.trade',
};

export const HELIUS_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ewr-sender.helius-rpc.com/fast',
  [SwqosRegion.Frankfurt]: 'http://fra-sender.helius-rpc.com/fast',
  [SwqosRegion.Amsterdam]: 'http://ams-sender.helius-rpc.com/fast',
  [SwqosRegion.SLC]: 'http://slc-sender.helius-rpc.com/fast',
  [SwqosRegion.Tokyo]: 'http://tyo-sender.helius-rpc.com/fast',
  [SwqosRegion.London]: 'http://lon-sender.helius-rpc.com/fast',
  [SwqosRegion.LosAngeles]: 'http://sg-sender.helius-rpc.com/fast',
  [SwqosRegion.Singapore]: 'http://sg-sender.helius-rpc.com/fast',
  [SwqosRegion.Default]: 'https://sender.helius-rpc.com/fast',
};

export const NODE1_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ny.node1.me',
  [SwqosRegion.Frankfurt]: 'http://fra.node1.me',
  [SwqosRegion.Amsterdam]: 'http://ams.node1.me',
  [SwqosRegion.SLC]: 'http://ny.node1.me',
  [SwqosRegion.Tokyo]: 'http://tk.node1.me',
  [SwqosRegion.London]: 'http://lon.node1.me',
  [SwqosRegion.LosAngeles]: 'http://ny.node1.me',
  [SwqosRegion.Singapore]: 'http://fra.node1.me',
  [SwqosRegion.Default]: 'http://fra.node1.me',
};

export const BLOCK_RAZOR_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://newyork.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.Frankfurt]: 'http://frankfurt.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.Amsterdam]: 'http://amsterdam.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.SLC]: 'http://newyork.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.Tokyo]: 'http://tokyo.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.London]: 'http://london.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.LosAngeles]: 'http://newyork.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.Singapore]: 'http://frankfurt.solana.blockrazor.xyz:443/v2/sendTransaction',
  [SwqosRegion.Default]: 'http://frankfurt.solana.blockrazor.xyz:443/v2/sendTransaction',
};

export const ASTRALANE_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ny.gateway.astralane.io/irisb',
  [SwqosRegion.Frankfurt]: 'http://fr.gateway.astralane.io/irisb',
  [SwqosRegion.Amsterdam]: 'http://ams.gateway.astralane.io/irisb',
  [SwqosRegion.SLC]: 'http://ny.gateway.astralane.io/irisb',
  [SwqosRegion.Tokyo]: 'http://jp.gateway.astralane.io/irisb',
  [SwqosRegion.London]: 'http://ny.gateway.astralane.io/irisb',
  [SwqosRegion.LosAngeles]: 'http://lax.gateway.astralane.io/irisb',
  [SwqosRegion.Singapore]: 'http://lim.gateway.astralane.io/irisb',
  [SwqosRegion.Default]: 'http://lim.gateway.astralane.io/irisb',
};

export const STELLIUM_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ewr1.flashrpc.com',
  [SwqosRegion.Frankfurt]: 'http://fra1.flashrpc.com',
  [SwqosRegion.Amsterdam]: 'http://ams1.flashrpc.com',
  [SwqosRegion.SLC]: 'http://ewr1.flashrpc.com',
  [SwqosRegion.Tokyo]: 'http://tyo1.flashrpc.com',
  [SwqosRegion.London]: 'http://lhr1.flashrpc.com',
  [SwqosRegion.LosAngeles]: 'http://ewr1.flashrpc.com',
  [SwqosRegion.Singapore]: 'http://fra1.flashrpc.com',
  [SwqosRegion.Default]: 'http://fra1.flashrpc.com',
};

export const NEXT_BLOCK_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'http://ny.nextblock.io',
  [SwqosRegion.Frankfurt]: 'http://frankfurt.nextblock.io',
  [SwqosRegion.Amsterdam]: 'http://amsterdam.nextblock.io',
  [SwqosRegion.SLC]: 'http://slc.nextblock.io',
  [SwqosRegion.Tokyo]: 'http://tokyo.nextblock.io',
  [SwqosRegion.London]: 'http://london.nextblock.io',
  [SwqosRegion.LosAngeles]: 'http://singapore.nextblock.io',
  [SwqosRegion.Singapore]: 'http://singapore.nextblock.io',
  [SwqosRegion.Default]: 'http://frankfurt.nextblock.io',
};

export const SOYAS_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'nyc.landing.soyas.xyz:9000',
  [SwqosRegion.Frankfurt]: 'fra.landing.soyas.xyz:9000',
  [SwqosRegion.Amsterdam]: 'ams.landing.soyas.xyz:9000',
  [SwqosRegion.SLC]: 'nyc.landing.soyas.xyz:9000',
  [SwqosRegion.Tokyo]: 'tyo.landing.soyas.xyz:9000',
  [SwqosRegion.London]: 'lon.landing.soyas.xyz:9000',
  [SwqosRegion.LosAngeles]: 'nyc.landing.soyas.xyz:9000',
  [SwqosRegion.Singapore]: 'fra.landing.soyas.xyz:9000',
  [SwqosRegion.Default]: 'fra.landing.soyas.xyz:9000',
};

export const SPEEDLANDING_ENDPOINTS: Record<SwqosRegion, string> = {
  [SwqosRegion.NewYork]: 'nyc.speedlanding.trade:17778',
  [SwqosRegion.Frankfurt]: 'fra.speedlanding.trade:17778',
  [SwqosRegion.Amsterdam]: 'ams.speedlanding.trade:17778',
  [SwqosRegion.SLC]: 'nyc.speedlanding.trade:17778',
  [SwqosRegion.Tokyo]: 'tyo.speedlanding.trade:17778',
  [SwqosRegion.London]: 'fra.speedlanding.trade:17778',
  [SwqosRegion.LosAngeles]: 'nyc.speedlanding.trade:17778',
  [SwqosRegion.Singapore]: 'fra.speedlanding.trade:17778',
  [SwqosRegion.Default]: 'fra.speedlanding.trade:17778',
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

    return response.json();
  }

  protected async postRaw(url: string, body: string, headers: Record<string, string> = {}): Promise<unknown> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        ...headers,
      },
      body,
    });

    if (!response.ok) {
      throw new TradeError(response.status, `HTTP error: ${response.statusText}`);
    }

    return response.json();
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

    return result.result;
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
    return [result.result];
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

    return result.signature || result.result || '';
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

    return result.result;
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

    return result.result;
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
      return result[0].signature || result[0].result || '';
    }

    return result.signature || result.result || '';
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

    // Auth in URL param ?api-key=...
    let url = this.endpoint;
    if (this.apiKey) {
      url = `${this.endpoint}?api-key=${this.apiKey}`;
    }

    const result = (await this.post(url, payload)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message);
    }

    return result.result;
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

    return result.result;
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

    // Body is raw base64 string, Content-Type: text/plain
    const result = (await this.postRaw(url, encoded)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message || String(result.error));
    }

    return result.result || result.signature || '';
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
    const encoded = transaction.toString('base64');

    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [encoded, { encoding: 'base64' }],
    };

    // Auth in URL params ?api-key=...&method=sendTransaction
    let url = `${this.endpoint}?method=sendTransaction`;
    if (this.authToken) {
      url = `${this.endpoint}?api-key=${this.authToken}&method=sendTransaction`;
    }

    const result = (await this.post(url, payload)) as any;

    if (result.error) {
      throw new TradeError(result.error.code || 500, result.error.message || String(result.error));
    }

    return result.result || result.signature || '';
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

    return result.result || result.signature || '';
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

    return result.result || result.signature || '';
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

    return result.signature || result.result || '';
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

    return result.result;
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

// ===== Soyas Client =====

/**
 * Soyas SWQOS client.
 *
 * Transport: QUIC with mTLS (Keypair-based certificate).
 * Endpoint:  host:port (e.g. nyc.landing.soyas.xyz:9000)
 * Auth:      Solana Keypair (base58) used as mTLS client certificate.
 * Note:      QUIC is not natively supported in Node.js. Use the Rust SDK for
 *            full QUIC support. This client holds config for future integration.
 */
export class SoyasClient implements SwqosClient {
  private readonly tipAccount: string;

  constructor(
    private readonly rpcUrl: string,
    private readonly endpoint: string,
    private readonly apiKey?: string,
  ) {
    this.tipAccount = randomChoice(SOYAS_TIP_ACCOUNTS);
  }

  async sendTransaction(
    _tradeType: TradeType,
    _transaction: Buffer,
    _waitConfirmation: boolean,
  ): Promise<string> {
    throw new TradeError(501, 'Soyas requires QUIC transport with mTLS; not supported in Node.js SDK. Use the Rust SDK.');
  }

  async sendTransactions(
    _tradeType: TradeType,
    _transactions: Buffer[],
    _waitConfirmation: boolean,
  ): Promise<string[]> {
    throw new TradeError(501, 'Soyas requires QUIC transport with mTLS; not supported in Node.js SDK. Use the Rust SDK.');
  }

  getTipAccount(): string { return this.tipAccount; }
  getSwqosType(): SwqosType { return SwqosType.Soyas; }
  minTipSol(): number { return MIN_TIP_SOYAS; }
}

// ===== Speedlanding Client =====

/**
 * Speedlanding SWQOS client.
 *
 * Transport: QUIC with mTLS (Keypair-based certificate).
 * Endpoint:  host:port (e.g. nyc.speedlanding.trade:17778)
 * Auth:      Solana Keypair (base58) used as mTLS client certificate.
 * Note:      QUIC is not natively supported in Node.js. Use the Rust SDK for
 *            full QUIC support. This client holds config for future integration.
 */
export class SpeedlandingClient implements SwqosClient {
  private readonly tipAccount: string;

  constructor(
    private readonly rpcUrl: string,
    private readonly endpoint: string,
    private readonly apiKey?: string,
  ) {
    this.tipAccount = randomChoice(SPEEDLANDING_TIP_ACCOUNTS);
  }

  async sendTransaction(
    _tradeType: TradeType,
    _transaction: Buffer,
    _waitConfirmation: boolean,
  ): Promise<string> {
    throw new TradeError(501, 'Speedlanding requires QUIC transport with mTLS; not supported in Node.js SDK. Use the Rust SDK.');
  }

  async sendTransactions(
    _tradeType: TradeType,
    _transactions: Buffer[],
    _waitConfirmation: boolean,
  ): Promise<string[]> {
    throw new TradeError(501, 'Speedlanding requires QUIC transport with mTLS; not supported in Node.js SDK. Use the Rust SDK.');
  }

  getTipAccount(): string { return this.tipAccount; }
  getSwqosType(): SwqosType { return SwqosType.Speedlanding; }
  minTipSol(): number { return MIN_TIP_SPEEDLANDING; }
}

// ===== Client Factory =====

export interface SwqosClientConfig {
  type: SwqosType;
  region?: SwqosRegion;
  customUrl?: string;
  apiKey?: string;
  mevProtection?: boolean;
}

export class ClientFactory {
  static createClient(config: SwqosClientConfig, rpcUrl: string): SwqosClient {
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
        return new HeliusClient(rpcUrl, endpoint, config.apiKey, false);
      }

      case SwqosType.Node1: {
        const endpoint = config.customUrl || NODE1_ENDPOINTS[region];
        return new Node1Client(rpcUrl, endpoint, config.apiKey);
      }

      case SwqosType.BlockRazor: {
        const endpoint = config.customUrl || BLOCK_RAZOR_ENDPOINTS[region];
        return new BlockRazorClient(rpcUrl, endpoint, config.apiKey, config.mevProtection ?? false);
      }

      case SwqosType.Astralane: {
        const endpoint = config.customUrl || ASTRALANE_ENDPOINTS[region];
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

      case SwqosType.Default:
      default:
        return new DefaultClient(rpcUrl);
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
