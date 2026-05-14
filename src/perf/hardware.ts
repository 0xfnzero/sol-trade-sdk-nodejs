/**
 * Hardware Optimization Module for Sol Trade SDK
 * Provides CPU affinity, NUMA optimization, and cache optimizations.
 */

// ===== Types =====

/**
 * CPU topology information
 */
export interface CPUTopology {
  physicalCores: number;
  logicalCores: number;
  numaNodes: number;
  cacheLevels: CacheInfo[];
}

/**
 * Cache information
 */
export interface CacheInfo {
  level: number;
  size: number;
  lineSize: number;
  associativity: number;
}

/**
 * CPU affinity configuration
 */
export interface AffinityConfig {
  /** Enable CPU pinning */
  enablePinning: boolean;
  /** Preferred CPU cores */
  preferredCores: number[];
  /** Avoid hyperthreading pairs */
  avoidSMT: boolean;
  /** NUMA node preference */
  numaNode: number;
}

/**
 * Default affinity configuration
 */
export function defaultAffinityConfig(): AffinityConfig {
  return {
    enablePinning: false,
    preferredCores: [],
    avoidSMT: true,
    numaNode: 0,
  };
}

/**
 * NUMA configuration
 */
export interface NUMAConfig {
  /** Enable NUMA-aware allocation */
  enableNUMA: boolean;
  /** Preferred NUMA node */
  preferredNode: number;
  /** Interleave memory across nodes */
  interleave: boolean;
}

/**
 * Default NUMA configuration
 */
export function defaultNUMAConfig(): NUMAConfig {
  return {
    enableNUMA: false,
    preferredNode: 0,
    interleave: false,
  };
}

// ===== CPU Affinity =====

/**
 * CPU affinity manager for pinning threads to specific cores.
 * Reduces context switches and improves cache locality.
 */
export class CPUAffinity {
  private config: AffinityConfig;
  private pinnedCores: Set<number> = new Set();

  constructor(config: AffinityConfig = defaultAffinityConfig()) {
    this.config = config;
  }

  /**
   * Get CPU topology information
   */
  getTopology(): CPUTopology {
    // In Node.js, we have limited access to CPU info
    const os = require('os');
    const cpus = os.cpus();

    // Estimate physical cores (this is approximate)
    const logicalCores = cpus.length;
    const physicalCores = Math.ceil(logicalCores / 2); // Assume SMT

    return {
      physicalCores,
      logicalCores,
      numaNodes: 1, // Node.js doesn't expose NUMA info
      cacheLevels: [
        { level: 1, size: 32 * 1024, lineSize: 64, associativity: 8 },
        { level: 2, size: 256 * 1024, lineSize: 64, associativity: 8 },
        { level: 3, size: 8 * 1024 * 1024, lineSize: 64, associativity: 16 },
      ],
    };
  }

  /**
   * Pin current execution context to a specific core
   * Note: In Node.js, this is advisory only via worker threads
   */
  pinToCore(coreId: number): boolean {
    if (!this.config.enablePinning) {
      return false;
    }

    // Node.js doesn't support true CPU pinning
    // This is a placeholder for potential native addon integration
    this.pinnedCores.add(coreId);
    return true;
  }

  /**
   * Pin to multiple cores
   */
  pinToCores(coreIds: number[]): boolean {
    if (!this.config.enablePinning) {
      return false;
    }

    for (const coreId of coreIds) {
      this.pinnedCores.add(coreId);
    }
    return true;
  }

  /**
   * Get recommended cores for pinning
   */
  getRecommendedCores(count: number = 1): number[] {
    const topology = this.getTopology();
    const cores: number[] = [];

    if (this.config.preferredCores.length > 0) {
      // Use preferred cores
      for (let i = 0; i < count && i < this.config.preferredCores.length; i++) {
        cores.push(this.config.preferredCores[i]!);
      }
    } else {
      // Use first N physical cores (avoiding SMT if configured)
      const step = this.config.avoidSMT ? 2 : 1;
      for (let i = 0; i < count * step && i < topology.physicalCores; i += step) {
        cores.push(i);
      }
    }

    return cores;
  }

  /**
   * Check if a core is available
   */
  isCoreAvailable(coreId: number): boolean {
    const topology = this.getTopology();
    return coreId >= 0 && coreId < topology.logicalCores;
  }

  /**
   * Get current core (simulated)
   */
  getCurrentCore(): number {
    // Node.js doesn't expose this information
    return 0;
  }

  /**
   * Get pinned cores
   */
  getPinnedCores(): number[] {
    return Array.from(this.pinnedCores);
  }

  /**
   * Unpin all cores
   */
  unpinAll(): void {
    this.pinnedCores.clear();
  }
}

// ===== NUMA Optimizer =====

/**
 * NUMA (Non-Uniform Memory Access) optimizer.
 * Optimizes memory allocation for NUMA architectures.
 */
export class NUMAOptimizer {
  private config: NUMAConfig;
  private allocations: Map<string, NUMAAllocation> = new Map();

  constructor(config: NUMAConfig = defaultNUMAConfig()) {
    this.config = config;
  }

  /**
   * Allocate memory with NUMA awareness
   */
  allocate(size: number, tag: string = 'default'): ArrayBuffer {
    // In JavaScript, we can't control NUMA placement
    // This is a placeholder for potential WASM/native integration
    const buffer = new ArrayBuffer(size);

    this.allocations.set(tag, {
      buffer,
      size,
      node: this.config.preferredNode,
      timestamp: Date.now(),
    });

    return buffer;
  }

  /**
   * Allocate typed array with NUMA awareness
   */
  allocateTypedArray<T extends TypedArray>(
    constructor: TypedArrayConstructor<T>,
    length: number,
    tag: string = 'default'
  ): T {
    const bytesPerElement = constructor.BYTES_PER_ELEMENT;
    const buffer = this.allocate(length * bytesPerElement, tag);
    return new constructor(buffer) as T;
  }

  /**
   * Get allocation information
   */
  getAllocation(tag: string): NUMAAllocation | undefined {
    return this.allocations.get(tag);
  }

  /**
   * Get local memory node for current thread
   */
  getLocalNode(): number {
    // Node.js doesn't expose NUMA info
    return this.config.preferredNode;
  }

  /**
   * Get number of NUMA nodes
   */
  getNodeCount(): number {
    // Node.js doesn't expose NUMA info
    return 1;
  }

  /**
   * Check if NUMA is available
   */
  isNUMAAvailable(): boolean {
    return false; // Not available in Node.js
  }

  /**
   * Migrate allocation to preferred node
   * Note: No-op in JavaScript
   */
  migrateToNode(tag: string, node: number): boolean {
    const allocation = this.allocations.get(tag);
    if (!allocation) {
      return false;
    }

    allocation.node = node;
    // Actual migration not possible in JS
    return true;
  }

  /**
   * Free allocation tracking
   */
  free(tag: string): void {
    this.allocations.delete(tag);
  }

  /**
   * Get all allocations
   */
  getAllAllocations(): Map<string, NUMAAllocation> {
    return new Map(this.allocations);
  }
}

/**
 * NUMA allocation tracking
 */
interface NUMAAllocation {
  buffer: ArrayBuffer;
  size: number;
  node: number;
  timestamp: number;
}

/**
 * Typed array types
 */
type TypedArray = Uint8Array | Uint16Array | Uint32Array | BigUint64Array |
  Int8Array | Int16Array | Int32Array | BigInt64Array |
  Float32Array | Float64Array;

interface TypedArrayConstructor<T> {
  new (buffer: ArrayBuffer): T;
  BYTES_PER_ELEMENT: number;
}

// ===== Cache Optimizer =====

/**
 * Cache optimization utilities.
 * Provides cache-friendly data structure layouts and prefetching hints.
 */
export class CacheOptimizer {
  private cacheLineSize: number = 64;
  private l1Size: number = 32 * 1024;
  private l2Size: number = 256 * 1024;
  private l3Size: number = 8 * 1024 * 1024;

  constructor() {
    // Default cache sizes - can be overridden
  }

  /**
   * Set cache parameters
   */
  setCacheParams(params: {
    cacheLineSize?: number;
    l1Size?: number;
    l2Size?: number;
    l3Size?: number;
  }): void {
    if (params.cacheLineSize) this.cacheLineSize = params.cacheLineSize;
    if (params.l1Size) this.l1Size = params.l1Size;
    if (params.l2Size) this.l2Size = params.l2Size;
    if (params.l3Size) this.l3Size = params.l3Size;
  }

  /**
   * Align size to cache line boundary
   */
  alignToCacheLine(size: number): number {
    const mask = this.cacheLineSize - 1;
    return (size + mask) & ~mask;
  }

  /**
   * Check if address is cache line aligned
   */
  isCacheLineAligned(address: number): boolean {
    return (address & (this.cacheLineSize - 1)) === 0;
  }

  /**
   * Calculate cache-friendly array stride
   */
  calculateStride(elementSize: number): number {
    // Ensure elements don't share cache lines
    return Math.max(elementSize, this.cacheLineSize);
  }

  /**
   * Create cache-friendly layout for array of objects
   */
  createSoALayout<T extends Record<string, number | bigint>>(
    count: number,
    schema: Record<keyof T, 'u8' | 'u16' | 'u32' | 'u64' | 'f32' | 'f64'>
  ): StructureOfArrays<T> {
    const typeSizes: Record<string, number> = {
      u8: 1, u16: 2, u32: 4, u64: 8, f32: 4, f64: 8,
    };

    const arrays: Partial<Record<keyof T, TypedArray>> = {};
    const offsets: Partial<Record<keyof T, number>> = {};
    let currentOffset = 0;

    for (const [key, type] of Object.entries(schema)) {
      const size = typeSizes[type];
      if (size === undefined) {
        throw new Error(`Unsupported struct field type: ${type}`);
      }
      const alignedOffset = this.alignToCacheLine(currentOffset);
      offsets[key as keyof T] = alignedOffset;

      // Create appropriate typed array
      const totalSize = alignedOffset + count * size;
      const buffer = new ArrayBuffer(totalSize);

      switch (type) {
        case 'u8':
          arrays[key as keyof T] = new Uint8Array(buffer, alignedOffset, count) as any;
          break;
        case 'u16':
          arrays[key as keyof T] = new Uint16Array(buffer, alignedOffset, count) as any;
          break;
        case 'u32':
          arrays[key as keyof T] = new Uint32Array(buffer, alignedOffset, count) as any;
          break;
        case 'u64':
          arrays[key as keyof T] = new BigUint64Array(buffer, alignedOffset, count) as any;
          break;
        case 'f32':
          arrays[key as keyof T] = new Float32Array(buffer, alignedOffset, count) as any;
          break;
        case 'f64':
          arrays[key as keyof T] = new Float64Array(buffer, alignedOffset, count) as any;
          break;
      }

      currentOffset = alignedOffset + count * size;
    }

    return {
      arrays: arrays as Record<keyof T, TypedArray>,
      offsets: offsets as Record<keyof T, number>,
      count,
      get(index: number): T {
        const result = {} as T;
        for (const key of Object.keys(arrays) as Array<keyof T>) {
          result[key] = (arrays[key] as any)[index];
        }
        return result;
      },
      set(index: number, value: T): void {
        for (const key of Object.keys(arrays) as Array<keyof T>) {
          (arrays[key] as any)[index] = value[key];
        }
      },
    };
  }

  /**
   * Get cache line size
   */
  getCacheLineSize(): number {
    return this.cacheLineSize;
  }

  /**
   * Get L1 cache size
   */
  getL1Size(): number {
    return this.l1Size;
  }

  /**
   * Get L2 cache size
   */
  getL2Size(): number {
    return this.l2Size;
  }

  /**
   * Get L3 cache size
   */
  getL3Size(): number {
    return this.l3Size;
  }
}

/**
 * Structure of Arrays layout
 */
interface StructureOfArrays<T> {
  arrays: Record<keyof T, TypedArray>;
  offsets: Record<keyof T, number>;
  count: number;
  get(index: number): T;
  set(index: number, value: T): void;
}

// ===== Hardware Monitor =====

/**
 * Hardware performance monitoring
 */
export class HardwareMonitor {
  private startTime: number = 0;
  private measurements: HardwareMeasurement[] = [];

  /**
   * Start monitoring
   */
  start(): void {
    this.startTime = performance.now();
  }

  /**
   * Take a measurement
   */
  measure(label: string): void {
    this.measurements.push({
      label,
      timestamp: performance.now() - this.startTime,
      memory: this.getMemoryInfo(),
    });
  }

  /**
   * Get memory information
   */
  getMemoryInfo(): MemoryInfo {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        used: usage.heapUsed,
        total: usage.heapTotal,
        external: usage.external,
        rss: usage.rss,
      };
    }

    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const mem = (performance as any).memory;
      return {
        used: mem.usedJSHeapSize,
        total: mem.totalJSHeapSize,
        external: 0,
        rss: 0,
      };
    }

    return { used: 0, total: 0, external: 0, rss: 0 };
  }

  /**
   * Get all measurements
   */
  getMeasurements(): HardwareMeasurement[] {
    return [...this.measurements];
  }

  /**
   * Reset measurements
   */
  reset(): void {
    this.measurements = [];
    this.startTime = performance.now();
  }
}

/**
 * Memory information
 */
interface MemoryInfo {
  used: number;
  total: number;
  external: number;
  rss: number;
}

/**
 * Hardware measurement
 */
interface HardwareMeasurement {
  label: string;
  timestamp: number;
  memory: MemoryInfo;
}

// ===== Convenience Functions =====

/**
 * Create a CPU affinity manager
 */
export function createCPUAffinity(config?: Partial<AffinityConfig>): CPUAffinity {
  const fullConfig = { ...defaultAffinityConfig(), ...config };
  return new CPUAffinity(fullConfig);
}

/**
 * Create a NUMA optimizer
 */
export function createNUMAOptimizer(config?: Partial<NUMAConfig>): NUMAOptimizer {
  const fullConfig = { ...defaultNUMAConfig(), ...config };
  return new NUMAOptimizer(fullConfig);
}

/**
 * Create a cache optimizer
 */
export function createCacheOptimizer(): CacheOptimizer {
  return new CacheOptimizer();
}

/**
 * Create a hardware monitor
 */
export function createHardwareMonitor(): HardwareMonitor {
  return new HardwareMonitor();
}

/**
 * Get system CPU information
 */
export function getSystemCPUInfo(): { cores: number; model: string } {
  const os = require('os');
  const cpus = os.cpus();
  return {
    cores: cpus.length,
    model: cpus[0]?.model || 'Unknown',
  };
}

/**
 * Get system memory information
 */
export function getSystemMemoryInfo(): { total: number; free: number } {
  const os = require('os');
  return {
    total: os.totalmem(),
    free: os.freemem(),
  };
}
