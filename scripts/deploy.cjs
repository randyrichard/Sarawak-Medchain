const hre = require("hardhat");

async function main() {
  const [deployer, doctor1, doctor2, patient1] = await hre.ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await hre.ethers.provider.getBalance(deployer.address)).toString());

  const SarawakMedMVP = await hre.ethers.getContractFactory("SarawakMedMVP");
  const sarawakMed = await SarawakMedMVP.deploy();

  await sarawakMed.waitForDeployment();

  const contractAddress = await sarawakMed.getAddress();
  console.log("\n========================================");
  console.log("SarawakMedMVP deployed to:", contractAddress);
  console.log("========================================\n");

  // Add some verified doctors for testing
  console.log("Adding verified doctors for testing...\n");

  const tx1 = await sarawakMed.addVerifiedDoctor(doctor1.address);
  await tx1.wait();
  console.log("✓ Doctor 1 verified:", doctor1.address);

  const tx2 = await sarawakMed.addVerifiedDoctor(doctor2.address);
  await tx2.wait();
  console.log("✓ Doctor 2 verified:", doctor2.address);

  console.log("\n========================================");
  console.log("Test Accounts (Import these into MetaMask):");
  console.log("========================================");
  console.log("Admin/Deployer:", deployer.address);
  console.log("Doctor 1 (Verified):", doctor1.address);
  console.log("Doctor 2 (Verified):", doctor2.address);
  console.log("Patient 1:", patient1.address);

  console.log("\n========================================");
  console.log("IMPORTANT: Update your .env files");
  console.log("========================================");
  console.log("Add to frontend/.env:");
  console.log(`VITE_CONTRACT_ADDRESS=${contractAddress}`);
  console.log("\nDeployment complete!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
