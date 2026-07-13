require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(express.json());

const DB_FILE = "./db.json";

let db = {
  users: [],
  wallets: [],
  transactions: [],
  coins: [],
  portfolios: [],
  resetCodes: []
};

// =====================
// ADD PORTFOLIO HOLDING
// =====================
app.post("/portfolio/add", (req, res) => {
  const user = auth(req);

  if (!user) {
    return res.status(401).json({
      message: "Invalid token"
    });
  }

  const { coin, amount } = req.body;

  if (!coin || amount === undefined) {
    return res.status(400).json({
      message: "Coin and amount are required"
    });
  }

  let portfolio = db.portfolios.find(
    p => p.userId === user.id
  );

  if (!portfolio) {
    portfolio = {
      userId: user.id,
      holdings: []
    };

    db.portfolios.push(portfolio);
  }

  const existing = portfolio.holdings.find(
    h => h.coin === coin
  );

  if (existing) {
    existing.amount += Number(amount);
  } else {
    portfolio.holdings.push({
      coin,
      amount: Number(amount)
    });
  }

  saveDB();

  res.json({
    message: "Holding added successfully",
    portfolio
  });
});

app.get("/coins/gainers", (req, res) => {
  const coins = db.coins || [];

  const gainers = [...coins]
    .sort((a, b) => b.change24h - a.change24h)
    .slice(0, 10);

  res.json({
    type: "gainers",
    coins: gainers,
    lastUpdated: db.lastUpdated || null
  });
});

app.get("/coins/:symbol", (req, res) => {
  const symbol = req.params.symbol.toUpperCase();

  const coin = (db.coins || []).find(
    c => c.symbol === symbol
  );

  if (!coin) {
    return res.status(404).json({
      message: "Coin not found"
    });
  }

  res.json({
    symbol: coin.symbol,
    name: coin.name,
    price: coin.price,
    change24h: coin.change24h,
    lastUpdated: db.lastUpdated || null
  });
});

if (fs.existsSync(DB_FILE)) {
  db = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}

db.watchlists = db.watchlists || [];
db.portfolios = db.portfolios || [];
db.resetCodes = db.resetCodes || [];


app.get("/watchlist", (req, res) => {
  const user = auth(req, res);
  if (!user) return res.status(401).json({ message: "Invalid token" });

  const watch = db.watchlists?.find(w => w.userId === user.id);
  const coins = watch?.coins || [];

  const enriched = coins.map(symbol => {
    const coin = prices.coins?.find(c => c.symbol === symbol);

    return {
      symbol,
      price: coin?.price || null,
      change24h: coin?.change24h || null
    };
  });

  res.json({
    userId: user.id,
    coins: enriched
  });
});

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// =====================
// SEARCH COINS
// =====================
app.get("/search", (req, res) => {
  const query = (req.query.q || "").trim().toLowerCase();

  if (!query) {
    return res.status(400).json({
      message: "Search query is required"
    });
  }

  const results = (db.coins || [])
    .filter(coin =>
      coin.name.toLowerCase().includes(query) ||
      coin.symbol.toLowerCase().includes(query)
    )
    .map(coin => ({
      symbol: coin.symbol,
      name: coin.name
    }));

  res.json({
    query,
    count: results.length,
    results
  });
});

// =====================
// REGISTER
// =====================
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({
      message: "Username, email and password are required"
    });
  }

  const usernameExists = db.users.find(
    u => u.username.toLowerCase() === username.toLowerCase()
  );

  if (usernameExists) {
    return res.status(400).json({
      message: "Username already exists"
    });
  }

  const emailExists = db.users.find(
    u => u.email && u.email.toLowerCase() === email.toLowerCase()
  );

  if (emailExists) {
    return res.status(400).json({
      message: "Email already exists"
    });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = {
  id: Date.now().toString(),
  username,
  email,
  password: hashedPassword
};

  db.users.push(user);
  saveDB();

  res.status(201).json({
    message: "Registered successfully",
    user: {
      username,
      email
    }
  });
});

// REMOVE COIN
app.post("/watchlist/remove", (req, res) => {
  const user = auth(req);
  if (!user) {
    return res.status(401).json({ message: "Invalid token" });
  }

  const { coin } = req.body;

  if (!coin) {
    return res.status(400).json({ message: "Coin required" });
  }

  const watch = getWatchlist(user.id);

  if (!watch) {
    return res.status(404).json({
      message: "Watchlist not found"
    });
  }

  watch.coins = watch.coins.filter(
    c => c !== coin.toUpperCase()
  );

  saveDB();

  res.json({
    message: "Coin removed from watchlist",
    watchlist: watch
  });
});

// =====================
// LOGIN
// =====================
app.post("/login", async (req, res) => {
  const { username, email, password } = req.body;

  const identifier = username || email;

  if (!identifier || !password) {
    return res.status(400).json({
      message: "Username/email and password are required"
    });
  }

  const user = db.users.find(
    u =>
      u.username.toLowerCase() === identifier.toLowerCase() ||
      (u.email && u.email.toLowerCase() === identifier.toLowerCase())
  );

  if (!user) {
    return res.status(400).json({
      message: "Invalid credentials"
    });
  }

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return res.status(400).json({
      message: "Invalid credentials"
    });
  }

  const token = jwt.sign(
    {      id: user.id,
      username: user.username
    },
    "secretkey",
    {
      expiresIn: "7d"
    }
  );

  res.json({
    message: "Login successful",
    token
  });
});

// =====================
// AUTH
// =====================
function auth(req) {
  const header = req.headers["authorization"];
  if (!header) return null;

  try {
    const token = header.split(" ")[1];
    return jwt.verify(token, "secretkey");
  } catch {
    return null;
  }
}

// =====================
// FORGOT PASSWORD
// =====================
app.post("/forgot-password", (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      message: "Email is required"
    });
  }

  const user = db.users.find(
    u => u.email && u.email.toLowerCase() === email.toLowerCase()
  );

  if (!user) {
    return res.status(404).json({
      message: "No account found with that email"
    });
  }

  // Generate a random 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // Remove any old reset code for this user
  db.resetCodes = db.resetCodes.filter(
    r => r.userId !== user.id
  );

  // Save new code (expires in 10 minutes)
  db.resetCodes.push({
    userId: user.id,
    email: user.email,
    code,
    expires: Date.now() + 10 * 60 * 1000
  });

  saveDB();

  res.json({
    message: "Password reset code generated",
    code
  });
});

app.post("/reset-password", async (req, res) => {
  const { email, code, newPassword } = req.body;

  const resetIndex = db.resetCodes.findIndex(
    r => r.email === email && r.code === code
  );

  if (resetIndex === -1) {
    return res.status(400).json({ message: "Invalid reset code" });
  }

  const userIndex = db.users.findIndex(u => u.email === email);

  if (userIndex === -1) {
    return res.status(404).json({ message: "User not found" });
  }

  db.users[userIndex].password = await bcrypt.hash(newPassword, 10);

  db.resetCodes.splice(resetIndex, 1);

  saveDB();

 return res.json({ message: "Password changed successfully" });
});

// =====================
// ROOT (CLEAN STATE)
// =====================
app.get("/", (req, res) => {
  res.json({
    app: "Coinova",
    status: "running",
    mode: "crypto-tracker-base"
  });
});

// =====================
// SERVER
// =====================
let prices = {};

async function updatePrices() {
  try {
    let data = [];

try {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=30&page=1"
  );

  if (!res.ok) {
    console.log("CoinGecko error:", res.status);
    return;
  }

  data = await res.json();

} catch (err) {
  console.log("Price fetch failed (keeping old prices):", err.message);
  return;
}

if (!data || data.length === 0) return;

    prices = {
      coins: data.map(c => ({
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        price: c.current_price,
        change24h: c.price_change_percentage_24h
      })),
      lastUpdated: new Date().toISOString()
    };

    console.log("Prices updated:", prices);

db.coins = prices.coins;
db.lastUpdated = prices.lastUpdated;

saveDB();

  } catch (err) {
    console.log("Price update error:", err.message);
  }
}

updatePrices(); // initial fetch

setInterval(updatePrices, 30000); // every 15 seconds

app.get("/prices", (req, res) => {
  res.json(prices);
});

app.post("/watchlist/add", (req, res) => {
  const user = auth(req);
  if (!user) return res.status(401).json({ message: "Invalid token" });

  const { coin } = req.body;

  let list = db.watchlists.find(w => w.userId === user.id);

  if (!list) {
    list = {
      userId: user.id,
      coins: []
    };
    db.watchlists.push(list);
  }

  if (!list.coins.includes(coin)) {
    list.coins.push(coin);
  }

  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

  res.json({
    message: "Coin added to watchlist",
    watchlist: list
  });
});

app.get("/watchlist", (req, res) => {
  const user = auth(req);
  if (!user) return res.status(401).json({ message: "Invalid token" });

  const list = db.watchlists.find(w => w.userId === user.id);

  res.json(list || { userId: user.id, coins: [] });
});

if (!db.watchlists) {
  db.watchlists = [];
}

function getWatchlist(userId) {
  return db.watchlists.find(w => w.userId === userId);
}

// ADD COIN
app.post("/watchlist/add", (req, res) => {
  const user = auth(req, res);
  if (!user) return res.status(401).json({ message: "Invalid token" });

  const { coin } = req.body;
  if (!coin) return res.status(400).json({ message: "Coin required" });

  let watch = getWatchlist(user.id);

  if (!watch) {
    watch = { userId: user.id, coins: [] };
    db.watchlists.push(watch);
  }

  if (!watch.coins.includes(coin)) {
    watch.coins.push(coin);
  }

  saveDB();

  res.json({
    message: "Coin added to watchlist",
    watchlist: watch
  });
});

// GET WATCHLIST (WITH PRICES)
app.get("/watchlist", (req, res) => {
  const user = auth(req, res);
  if (!user) return res.status(401).json({ message: "Invalid token" });

  const watch = getWatchlist(user.id);

  if (!watch) {
    return res.json({ userId: user.id, coins: [] });
  }

  const enriched = watch.coins.map(symbol => {
    const coin = db.prices?.coins?.find?.(c => c.symbol === symbol)
      || prices?.coins?.find?.(c => c.symbol === symbol);

    return {
      symbol,
      name: coin?.name || symbol,
      price: coin?.price || null,
      change24h: coin?.change24h || null
    };
  });

  res.json({
    userId: user.id,
    coins: enriched
  });
});

app.get("/coins", (req, res) => {
  res.json({
    coins: db.coins || [],
    lastUpdated: db.lastUpdated || null
  });
});

app.listen(3000, () => {
  console.log("Coinova API running on port 3000");
});
