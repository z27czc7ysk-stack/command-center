export async function onRequestGet({ request, env }) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "public, max-age=900"
  };

  if (!env.TWELVE_DATA_API_KEY) {
    return new Response(
      JSON.stringify({ error: "API-Schlüssel fehlt" }),
      { status: 500, headers }
    );
  }

  const apiKey = env.TWELVE_DATA_API_KEY;

  async function twelveData(symbol, exchange) {
    const url = new URL("https://api.twelvedata.com/price");
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("exchange", exchange);
    url.searchParams.set("apikey", apiKey);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !data.price) {
      throw new Error(data.message || "Kurs nicht verfügbar");
    }

    return Number(data.price);
  }

  async function getEuroRate() {
    const url = new URL(
      "https://api.twelvedata.com/exchange_rate"
    );
    url.searchParams.set("symbol", "USD/EUR");
    url.searchParams.set("apikey", apiKey);

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || !data.rate) {
      throw new Error("EUR-Wechselkurs nicht verfügbar");
    }

    return Number(data.rate);
  }

  async function getPosition(name, symbol, exchange, currency) {
    try {
      const price = await twelveData(symbol, exchange);

      return {
        name,
        symbol,
        price,
        currency,
        status: "ok"
      };
    } catch (error) {
      return {
        name,
        symbol,
        price: null,
        currency,
        status: "unavailable",
        message: error.message
      };
    }
  }

  const positions = await Promise.all([
    getPosition("Core MSCI World", "EUNL", "XETR", "EUR"),
    getPosition("Alphabet A", "GOOGL", "NASDAQ", "USD"),
    getPosition("Core MSCI EM IMI", "IS3N", "XETR", "EUR"),
    getPosition("Physical Gold", "PPFB", "XETR", "EUR")
  ]);

  let euroRate = null;

  if (positions[1].status === "ok") {
    try {
      euroRate = await getEuroRate();
      positions[1].price *= euroRate;
      positions[1].currency = "EUR";
    } catch (error) {
      positions[1].status = "unavailable";
      positions[1].price = null;
      positions[1].message = error.message;
    }
  }

  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,solana&vs_currencies=eur"
    );

    if (!response.ok) {
      throw new Error("CoinGecko momentan nicht erreichbar");
    }

    const crypto = await response.json();

    positions.push(
      {
        name: "Bitcoin",
        symbol: "BTC",
        price: crypto.bitcoin?.eur ?? null,
        currency: "EUR",
        status: crypto.bitcoin?.eur ? "ok" : "unavailable"
      },
      {
        name: "Solana",
        symbol: "SOL",
        price: crypto.solana?.eur ?? null,
        currency: "EUR",
        status: crypto.solana?.eur ? "ok" : "unavailable"
      }
    );
  } catch (error) {
    positions.push(
      {
        name: "Bitcoin",
        symbol: "BTC",
        price: null,
        currency: "EUR",
        status: "unavailable"
      },
      {
        name: "Solana",
        symbol: "SOL",
        price: null,
        currency: "EUR",
        status: "unavailable"
      }
    );
  }

  return new Response(
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      currency: "EUR",
      positions
    }),
    { headers }
  );
}
