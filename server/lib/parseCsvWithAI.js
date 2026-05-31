'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a financial portfolio CSV parser specialising in UK broker exports (Hargreaves Lansdown, Freetrade, Trading 212, IBKR, Vanguard, etc.).

TICKER EXTRACTION
Many UK broker CSVs have no dedicated ticker column — the ticker must be inferred from the description/company name. Rules:
- Use your knowledge of real stock tickers. "Pool Corp" → POOL, "Berkshire Hathaway Class B" → BRK-B, "Moody's Corp" → MCO, "Occidental Petroleum" → OXY, "Fidelity National Information Services" → FIS, "S&P Global" → SPGI, "Elevance Health" → ELV, "Centene Corp" → CNC, "Howard Hughes Holdings" → HHH, "Canadian Pacific Kansas City" → CP, "Under Armour Class C" → UA, "Neogen Corp" → NEOG, "Pershing Square Holdings" → PSH, "Universal Music Group" → UMG, "Vanguard S&P 500 UCITS ETF" → VUSA, "Mercer International" → MERC, "Allianz SE" / "Allianz SE NPV" / "Allianz SE NPV(Regd)(Vinkuliert)(CDI)" → ALV.DE (currency: EUR), "Nestle Sa" / "Nestlé" → NESN.SW (currency: CHF), "CLIQ Digital AG" → CLIQ.DE (currency: EUR), "Hershey" → HSY, "Nike Inc" → NKE, "Starbucks Corp" → SBUX, "JELD-WEN Holding" → JELD.
- For ADRs (description contains "ADR"): use the ADR ticker. "Marubeni Corp ADR" → MARUY.
- Use CURRENT tickers, not delisted ones. Companies rebrand and tickers change — always use the active ticker. Weatherford International relisted in 2021 as WFRD (not WFT). Bank of Georgia / Bank of Georgia Group / Lion Finance Group / Lion Finance Group Plc → BGEO.L (rebranded but same LSE listing). Universal Music Group NV → UMG.AS (Euronext Amsterdam).
- For UK-listed stocks add .L suffix: "HSBC Holdings" → HSBA.L, "Pershing Square Holdings" → PSH.L.
- If the description contains an exchange suffix like (GBP) or lists as a UCITS ETF or has "ORD GBP" in the description, it trades on a UK exchange — use the .L suffix ticker, NOT the US-listed equivalent. "iShares Core MSCI World UCITS ETF" → SWDA.L (NOT URTH). "iShares MSCI Europe UCITS ETF" → IMAE.L (NOT EZU).
- "JPMorgan Emerging Europe, Middle East & Africa" (also written as "JPMorgan Emerging Europe, Middle East & Africa Sec ORD GBP0.01") → JEMA.L
- Only flag a ticker as uncertain in parseWarnings if you genuinely cannot determine it.

PER-TRANSACTION CURRENCY
Each transaction has its own currency — the currency the stock trades in, NOT the statement currency:
- Description contains "USD..." (e.g. "USD0.001", "USD1") → currency: "USD", symbol: "$"
- Description contains "EUR..." (e.g. "EUR10") → currency: "EUR", symbol: "€"
- Description contains "NPV" with no currency tag, or it's a UK-listed fund/ETF → currency: "GBP", symbol: "£"
- UK broker statements price everything in pence (p) in the unit cost column — convert to pounds (divide by 100) for pricePerShare.

STATEMENT CURRENCY (top-level)
Set the top-level currency to the account/statement currency (usually GBP for UK brokers). Look for £ symbols or "Value (£)" column headers.

PRICE NORMALISATION
- If a "Unit cost" column is labelled "(p)" or "pence", values are in pence — divide by 100 to get pounds.
- pricePerShare should always be in the stock's trading currency (USD for USD stocks, etc.) but UK broker statements convert to GBP pence — keep as GBP pounds after dividing by 100 unless you have the original USD price.

PARSING RULES
- Normalize dates to YYYY-MM-DD
- action: "BUY" if money left the account (negative value), "SELL" if money came in (positive value)
- shares and pricePerShare must be positive numbers
- total = shares × pricePerShare (always positive)
- Skip header rows, summary rows, and blank rows
- Only add a parseWarning for genuinely ambiguous cases

DIVIDEND IDENTIFICATION
Dividends are positive cash flows that must be captured separately from trades. Include them in the dividends array, NOT as transactions.
- HL: rows where the description contains "Dividend" and quantity/price are n/a — e.g. "AAPL Dividend", "Vanguard Dividend"
- Trading 212: rows with action/type "Dividend", "Ordinary Dividend", or "Dividends paid"
- Freetrade: rows with type "Dividend" or "dividend"
- IBKR: rows with type "Dividends" or description matching "Dividend - [ticker]"
- Any row containing the word "dividend" (case-insensitive) with no quantity/price
- Use the positive GBP amount as-is; normalise date to YYYY-MM-DD
- Do NOT include dividends in the transactions array

DEPOSIT IDENTIFICATION
Capture external cash deposits and withdrawals in the deposits array. These are needed to calculate accurate annual returns.
- Deposits (positive amount): "TopUp Subscription", "Opening Subscription", "REG. SAVER", "Card Web", "CARD WEB", "Transfer From Bank Account", "Deposit", any row where external cash enters the account
- Withdrawals (negative amount): "FPD", "Payment to Client Bank", "Withdrawal", any row where cash leaves to an external bank account
- Do NOT include in deposits: "MANAGE FEE", "INTEREST", "Transfer from Income Account", dividends — these are internal

FEE / INTEREST EXCLUSIONS
Skip entirely — do not include in transactions, dividends, or deposits:
- Management fees: "MANAGE FEE", "Platform fee", "Account fee", "Service charge"
- Cash interest on uninvested balance: HL "INTEREST" rows with description "Interest From [date] TO [date]"
- Internal transfers: "Transfer from Income Account"
- Withholding tax, stamp duty, FX conversion fees`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    currency: {
      type: 'string',
      description: 'ISO 4217 code for the statement/account currency (e.g. GBP)',
    },
    currencySymbol: {
      type: 'string',
      description: 'Symbol for the statement currency (e.g. £)',
    },
    currencyConfidence: {
      type: 'string',
      enum: ['high', 'medium', 'low', 'unknown'],
    },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ticker:        { type: 'string' },
          date:          { type: 'string', description: 'YYYY-MM-DD' },
          shares:        { type: 'number' },
          pricePerShare: { type: 'number' },
          total:         { type: 'number' },
          action:        { type: 'string', enum: ['BUY', 'SELL'] },
          currency:      { type: 'string', description: 'ISO 4217 code for this stock (USD, GBP, EUR, etc.)' },
          currencySymbol:{ type: 'string', description: 'Symbol for this stock currency' },
        },
        required: ['ticker', 'date', 'shares', 'pricePerShare', 'total', 'action', 'currency', 'currencySymbol'],
        additionalProperties: false,
      },
    },
    dividends: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date:        { type: 'string', description: 'YYYY-MM-DD' },
          amount:      { type: 'number', description: 'Dividend amount in GBP (always positive)' },
          description: { type: 'string' },
        },
        required: ['date', 'amount', 'description'],
        additionalProperties: false,
      },
    },
    deposits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          date:        { type: 'string', description: 'YYYY-MM-DD' },
          amount:      { type: 'number', description: 'Positive for cash in (deposit), negative for cash out (withdrawal)' },
          description: { type: 'string' },
        },
        required: ['date', 'amount', 'description'],
        additionalProperties: false,
      },
    },
    parseWarnings: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['currency', 'currencySymbol', 'currencyConfidence', 'transactions', 'dividends', 'deposits', 'parseWarnings'],
  additionalProperties: false,
};

function extractDeposits(csvContent) {
  const DEPOSIT_KEYS  = ['REG. SAVER', 'CARD WEB', 'TOPUP', 'TOP-UP', 'OPENING SUBSCRIPTION', 'TRANSFER FROM BANK', 'SUBSCRIPTION'];
  const WITHDRAW_KEYS = ['FPD', 'PAYMENT TO CLIENT BANK', 'WITHDRAWAL'];
  const EXCLUDE_KEYS  = ['MANAGE FEE', 'INTEREST', 'TRANSFER FROM INCOME', 'DIVIDEND'];

  const deposits = [];
  const lines = csvContent.split(/\r?\n/);

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = line.split(',');
    if (cols.length < 7) continue;

    const qty   = (cols[5] || '').trim().toLowerCase();
    const price = (cols[4] || '').trim().toLowerCase();
    if (qty !== 'n/a' || price !== 'n/a') continue;

    const ref    = (cols[2] || '').trim().toUpperCase();
    const desc   = (cols[3] || '').trim().toUpperCase();
    const amount = parseFloat((cols[6] || '').trim());
    if (isNaN(amount) || amount === 0) continue;

    const excluded   = EXCLUDE_KEYS.some(k  => ref.includes(k) || desc.includes(k));
    if (excluded) continue;

    const isDeposit  = amount > 0 && DEPOSIT_KEYS.some(k  => ref.includes(k) || desc.includes(k));
    const isWithdraw = amount < 0 && WITHDRAW_KEYS.some(k => ref.includes(k) || desc.includes(k));
    if (!isDeposit && !isWithdraw) continue;

    const parts = (cols[0] || '').trim().split('/');
    if (parts.length !== 3) continue;
    const [d, m, y] = parts;
    const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

    deposits.push({ date, amount, description: (cols[3] || '').trim() });
  }

  return deposits;
}

async function parseCsvWithAI(csvContent) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      {
        name: 'return_parsed_csv',
        description: 'Return the structured result of parsing the broker CSV',
        input_schema: RESPONSE_SCHEMA,
      },
    ],
    tool_choice: { type: 'tool', name: 'return_parsed_csv' },
    messages: [
      {
        role: 'user',
        content: `Parse this broker CSV and return the structured JSON:\n\n${csvContent}`,
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse) throw new Error('No tool_use block in AI response');

  return toolUse.input;
}

module.exports = { parseCsvWithAI, extractDeposits };
