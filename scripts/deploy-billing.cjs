const hre = require("hardhat");

async function main() {
  const [deployer, hospital1, hospital2] = await hre.ethers.getSigners();

  console.log("Deploying BillingHistory with account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  const BillingHistory = await hre.ethers.getContractFactory("BillingHistory");
  const billing = await BillingHistory.deploy();

  await billing.waitForDeployment();

  const contractAddress = await billing.getAddress();
  console.log("\n========================================");
  console.log("BillingHistory deployed to:", contractAddress);
  console.log("========================================\n");

  // Add some initial credits for testing
  console.log("Adding test credits...\n");

  const tx1 = await billing.addCredits(hospital1.address, 10);
  await tx1.wait();
  console.log("✓ Hospital 1 credited with 10 credits:", hospital1.address);

  const tx2 = await billing.addCredits(hospital2.address, 5);
  await tx2.wait();
  console.log("✓ Hospital 2 credited with 5 credits:", hospital2.address);

  console.log("\n========================================");
  console.log("Test Accounts:");
  console.log("========================================");
  console.log("Admin:", deployer.address);
  console.log("Hospital 1 (10 credits):", hospital1.address);
  console.log("Hospital 2 (5 credits):", hospital2.address);

  console.log("\n========================================");
  console.log("Add to frontend/.env:");
  console.log("========================================");
  console.log(`VITE_BILLING_CONTRACT_ADDRESS=${contractAddress}`);
  console.log("\nDeployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
