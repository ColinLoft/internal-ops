/**
 * NALU (Network Abstraction Layer Unit) utilities for H.264 and H.265 video processing
 * Contains functions for parsing and working with NALUs in video frames
 */
import type { NonSharedUint8Array } from '../../type-polyfills/non-shared-typed-arrays';
/**
 * Detected codec type from NALU analysis
 */
export type DetectedCodec = 'h264' | 'h265' | 'unknown';
/**
 * Result of NALU processing for frame encryption
 */
export interface NALUProcessingResult {
    /** Number of unencrypted bytes at the start of the frame */
    unencryptedBytes: number;
    /** Detected codec type */
    detectedCodec: DetectedCodec;
    /** Whether this frame requires NALU processing */
    requiresNALUProcessing: boolean;
}
/**
 * Process NALU data for frame encryption, detecting codec and finding unencrypted bytes
 * @param data Frame data
 * @param knownCodec Codec from other sources, used only when the bytes are inconclusive (optional)
 * @returns NALU processing result
 */
export declare function processNALUsForEncryption(data: NonSharedUint8Array, knownCodec?: 'h264' | 'h265'): NALUProcessingResult;
/**
 * Rewrite every 3-byte Annex B start code (00 00 01) in `data` to the 4-byte form (00 00 00 01).
 *
 * WebRTC's H.264/H.265 depacketizer always reconstructs NALUs with 4-byte start codes, regardless
 * of what the encoder emitted. Some encoders (e.g. Intel Quick Sync) emit 3-byte start codes, so
 * the unencrypted header a receiver sees would differ from what the sender authenticated as
 * AES-GCM additionalData. Normalizing on the sender makes both sides agree.
 *
 * Returns `data` unchanged (same instance) when it contains no 3-byte start codes.
 */
export declare function normalizeAnnexBStartCodes(data: NonSharedUint8Array): NonSharedUint8Array;
//# sourceMappingURL=naluUtils.d.ts.map
