import { describe, expect, it } from 'vitest';
import {
  SwqosRegion,
  SwqosTransport,
  SwqosType,
} from '../src/index';
import {
  ClientFactory,
  GlaiveClient,
  GlaiveQuicClient,
  GLAIVE_ENDPOINTS,
  GLAIVE_QUIC_ENDPOINTS,
  LUNARLANDER_ENDPOINTS,
  LUNARLANDER_QUIC_ENDPOINTS,
  LunarLanderClient,
  LunarLanderQuicClient,
  MIN_TIP_GLAIVE,
  MIN_TIP_LUNARLANDER,
  buildGlaiveBinaryUrl,
} from '../src/swqos/clients';

const TEST_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('LunarLander / Glaive factory parity', () => {
  it('exposes tip floors and regional endpoints matching Go/Rust', () => {
    expect(MIN_TIP_LUNARLANDER).toBe(0.001);
    expect(MIN_TIP_GLAIVE).toBe(0.0001);
    expect(LUNARLANDER_ENDPOINTS[SwqosRegion.Frankfurt]).toBe(
      'http://fra-1.prod.lunar-lander.hellomoon.io',
    );
    expect(LUNARLANDER_QUIC_ENDPOINTS[SwqosRegion.Frankfurt]).toBe(
      'fra-1.prod.lunar-lander.hellomoon.io:16888',
    );
    expect(GLAIVE_ENDPOINTS[SwqosRegion.Frankfurt]).toBe('http://fra.glaive.trade');
    expect(GLAIVE_QUIC_ENDPOINTS[SwqosRegion.Frankfurt]).toBe('fra.glaive.trade:4000');
  });

  it('builds Glaive binary URL with api-key and optional mev-protect', () => {
    expect(buildGlaiveBinaryUrl('http://fra.glaive.trade', TEST_UUID, true)).toBe(
      `http://fra.glaive.trade/binary?api-key=${TEST_UUID}&mev-protect=true`,
    );
  });

  it('defaults LunarLander and Glaive to QUIC when transport is unset', () => {
    const lunar = ClientFactory.createClient(
      { type: SwqosType.LunarLander, region: SwqosRegion.Frankfurt, apiKey: 'key' },
      'https://rpc.example',
    );
    expect(lunar).toBeInstanceOf(LunarLanderQuicClient);
    expect(lunar.minTipSol()).toBe(MIN_TIP_LUNARLANDER);

    const glaive = ClientFactory.createClient(
      { type: SwqosType.Glaive, region: SwqosRegion.Frankfurt, apiKey: TEST_UUID },
      'https://rpc.example',
    );
    expect(glaive).toBeInstanceOf(GlaiveQuicClient);
    expect(glaive.minTipSol()).toBe(MIN_TIP_GLAIVE);
  });

  it('creates HTTP clients when transport is Http', () => {
    const lunar = ClientFactory.createClient(
      {
        type: SwqosType.LunarLander,
        region: SwqosRegion.Frankfurt,
        apiKey: 'key',
        transport: SwqosTransport.Http,
      },
      'https://rpc.example',
    );
    expect(lunar).toBeInstanceOf(LunarLanderClient);

    const glaive = ClientFactory.createClient(
      {
        type: SwqosType.Glaive,
        region: SwqosRegion.Frankfurt,
        apiKey: TEST_UUID,
        transport: SwqosTransport.Http,
      },
      'https://rpc.example',
    );
    expect(glaive).toBeInstanceOf(GlaiveClient);
  });

  it('rejects Glaive gRPC and non-UUID v4 keys', () => {
    expect(() =>
      ClientFactory.createClient(
        {
          type: SwqosType.Glaive,
          apiKey: TEST_UUID,
          transport: SwqosTransport.Grpc,
        },
        'https://rpc.example',
      ),
    ).toThrow(/does not support the gRPC/);

    expect(() =>
      ClientFactory.createClient(
        {
          type: SwqosType.Glaive,
          apiKey: 'not-a-uuid',
          transport: SwqosTransport.Http,
        },
        'https://rpc.example',
      ),
    ).toThrow(/UUID v4/);
  });
});
