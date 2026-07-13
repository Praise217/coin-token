const readline = require("readline-sync");

let balance = 0;
let user = "";

function login() {
  user = readline.question("\nEnter username: ");
  console.log("Welcome " + user);
}

function menu() {
  while (true) {
    console.log("\n=== COIN TOKEN WALLET ===");
    console.log("1. View Balance");
    console.log("2. Deposit");
    console.log("3. Withdraw");
    console.log("4. Exit");

    let choice = readline.question("Choose option: ");

    if (choice === "1") {
      console.log("Balance: $" + balance);
    }

    if (choice === "2") {
      let amount = Number(readline.question("Deposit amount: "));
      balance += amount;
      console.log("Deposited!");
    }

    if (choice === "3") {
      let amount = Number(readline.question("Withdraw amount: "));
      balance -= amount;
      console.log("Withdrawn!");
    }

    if (choice === "4") {
      console.log("Goodbye " + user);
      break;
    }
  }
}

login();
menu();
