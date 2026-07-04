const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const demoDoctorAddress = process.env.DEMO_DOCTOR_ADDRESS;

  console.log("Deploying contracts to Sepolia with:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy SarawakMedMVP
  const SarawakMedMVP = await hre.ethers.getContractFactory("SarawakMedMVP");
  const sarawakMed = await SarawakMedMVP.deploy();
  await sarawakMed.waitForDeployment();
  const medContractAddress = await sarawakMed.getAddress();

  console.log("\n========================================");
  console.log("SarawakMedMVP deployed to:", medContractAddress);
  console.log("========================================\n");

  // Deploy BillingHistory
  const BillingHistory = await hre.ethers.getContractFactory("BillingHistory");
  const billing = await BillingHistory.deploy();
  await billing.waitForDeployment();
  const billingAddress = await billing.getAddress();

  console.log("========================================");
  console.log("BillingHistory deployed to:", billingAddress);
  console.log("========================================\n");

  // Connect contracts
  console.log("Connecting contracts...\n");
  const txConnect = await sarawakMed.setBillingContract(billingAddress);
  await txConnect.wait();
  console.log("✓ BillingHistory connected to SarawakMedMVP");

  // Verify demo doctor if address provided
  if (demoDoctorAddress) {
    console.log("\nSetting up demo doctor:", demoDoctorAddress);

    const tx1 = await sarawakMed.addVerifiedDoctor(demoDoctorAddress);
    await tx1.wait();
    console.log("✓ Demo doctor verified");

    const txCredit = await billing.addCredits(demoDoctorAddress, 100);
    await txCredit.wait();
    console.log("✓ Demo doctor credited with 100 credits");
  } else {
    console.log("\nNo DEMO_DOCTOR_ADDRESS set — skipping doctor setup");
  }

  console.log("\n========================================");
  console.log("Sepolia Deployment Complete!");
  console.log("========================================");
  console.log("Admin (deployer):", deployer.address);
  console.log("\nAdd these to frontend/.env.production:");
  console.log(`VITE_CONTRACT_ADDRESS=${medContractAddress}`);
  console.log(`VITE_BILLING_CONTRACT_ADDRESS=${billingAddress}`);
  console.log("========================================\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
