import { PublicKey } from "@solana/web3.js";
import * as nacl from "tweetnacl";
import { SignMessagePayload } from "../types/auth.types";
import base58 from "bs58";

export function generateNonce(): string {
  return crypto.randomUUID();
}

// Create a function to generate a user-friendly message string
export function createSignatureMessage(walletAddress: string): string {
  return `Welcome to marginfi!

Sign this message to securely authenticate your wallet.

This request will not trigger a transaction or require amy fees.

Wallet: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}
`;
}

// Update the generateSignMessage function
export async function generateSignMessage(walletAddress: string): Promise<SignMessagePayload> {
  const nonce = generateNonce();
  const timestamp = Date.now();

  // Store the original data for verification
  const payload: SignMessagePayload = {
    nonce,
    walletAddress,
    timestamp,
    // Store the formatted message for reference
    formattedMessage: createSignatureMessage(walletAddress),
  };

  return payload;
}

export function verifySignature(walletAddress: string, signature: Uint8Array | { signature: Uint8Array }): boolean {
  try {
    const publicKey = new PublicKey(walletAddress);

    // Handle both Phantom and standard wallet adapter signature formats
    const signatureBytes = "signature" in signature ? signature.signature : signature;

    // Recreate the exact message string that was signed
    const messageString = createSignatureMessage(walletAddress);

    // Encode the message string (not the JSON object)
    const messageBytes = new TextEncoder().encode(messageString);

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKey.toBytes());
  } catch (error) {
    console.error("Signature verification failed:", error);
    return false;
  }
}
