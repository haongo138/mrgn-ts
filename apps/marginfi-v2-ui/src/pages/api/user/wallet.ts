import { NextApiResponse } from "next";
import { setTimeout } from "timers/promises";
import { STATUS_BAD_REQUEST, STATUS_OK } from "@mrgnlabs/marginfi-v2-ui-state";
import { WSOL_MINT } from "@mrgnlabs/mrgn-common";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { NextApiRequest } from "../utils";

type WalletRequest = {
  wallet: string;
  tokenList?: string;
};

type Token = {
  name: string;
  symbol: string;
  price: number;
  total: number;
};

type NativeBalance = {
  lamports: number;
  price_per_sol: number;
  total_price: number;
};

type Asset = {
  content: {
    metadata: {
      name: string;
      symbol: string;
    };
  };
  token_info: {
    price_info: {
      price_per_token: number;
      total_price: number;
    };
  };
};

if (!process.env.HELIUS_API_KEY) {
  throw new Error("HELIUS_API_KEY is not set");
}

const HELIUS_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

async function fetchAssets(
  ownerAddress: string,
  page: number = 1,
  allItems: Asset[] = [],
  nativeBalance: NativeBalance | null = null
): Promise<{ items: any[]; nativeBalance: any }> {
  const solResponse = await fetch(HELIUS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "my-id",
      method: "getAsset",
      params: {
        id: WSOL_MINT.toBase58(),
      },
    }),
  });

  let solResponseJson = null;

  if (solResponse.ok) {
    solResponseJson = await solResponse.json();
  }

  const allTokensResponse = await fetch(HELIUS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "my-id",
      method: "getAssetsByOwner",
      params: {
        ownerAddress,
        page,
        limit: 1000,
        displayOptions: {
          showFungible: true,
          showNativeBalance: true,
        },
      },
    }),
  });

  if (!allTokensResponse.ok) {
    console.error("Error fetching assets:", allTokensResponse.statusText);
    return { items: allItems, nativeBalance };
  }

  const { result } = await allTokensResponse.json();
  allItems.push(...result.items);

  if (page === 1 && result.nativeBalance.lamports && solResponseJson.result.token_info.price_info) {
    nativeBalance = {
      lamports: result.nativeBalance.lamports,
      price_per_sol: solResponseJson.result.token_info.price_info.price_per_token,
      total_price:
        (result.nativeBalance.lamports / LAMPORTS_PER_SOL) *
        solResponseJson.result.token_info.price_info.price_per_token,
    };
  }

  if (result.items.length === 1000) {
    await setTimeout(100);
    return fetchAssets(ownerAddress, page + 1, allItems, nativeBalance);
  } else {
    return { items: allItems, nativeBalance };
  }
}

export default async function handler(req: NextApiRequest<WalletRequest>, res: NextApiResponse) {
  const ownerAddressParam = req.query.wallet as string;
  const tokenListParam = req.query.tokenList as string;

  if (!ownerAddressParam) {
    return res.status(STATUS_BAD_REQUEST).json({ error: true, message: "Missing wallet address" });
  }

  const ownerAddress = ownerAddressParam;
  const tokenList = tokenListParam ? Boolean(tokenListParam) : false;

  try {
    const { items, nativeBalance } = await fetchAssets(ownerAddress);

    const tokens: Token[] =
      items.length > 0
        ? items
            .filter((item: any) => item.token_info?.price_info?.total_price)
            .map((item: any) => {
              return {
                name: item.content.metadata.name,
                symbol: item.content.metadata.symbol,
                price: item.token_info.price_info.price_per_token,
                total: item.token_info.price_info.total_price,
              };
            })
            .sort((a: any, b: any) => b.total - a.total)
        : [];

    if (nativeBalance) {
      tokens.unshift({
        name: "SOL",
        symbol: "SOL",
        price: nativeBalance.price_per_sol,
        total: nativeBalance.total_price,
      });
    }

    const totalValue = tokens.reduce((acc: number, item: Token) => acc + item.total, 0);

    const data: {
      totalValue: number;
      tokens?: Token[];
    } = {
      totalValue,
    };

    if (tokenList) {
      data.tokens = tokens;
    }

    // cache for 4 minutes
    res.setHeader("Cache-Control", "s-maxage=240, stale-while-revalidate=59");
    return res.status(STATUS_OK).json(data);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Error fetching data" });
  }
}
