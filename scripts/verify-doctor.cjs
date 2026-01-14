const hre = require("hardhat");

async function main() {
  const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  const doctorAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  console.log("Checking contract at:", contractAddress);

  // Check if there's code at the address
  const code = await hre.ethers.provider.getCode(contractAddress);
  console.log("Contract bytecode exists:", code !== "0x");

  if (code === "0x") {
    console.log("ERROR: No contract deployed at this address!");
    console.log("Run: node scripts/deploy.cjs");
    return;
  }

  const contract = await hre.ethers.getContractAt("SarawakMedMVP", contractAddress);

  const admin = await contract.admin();
  console.log("Admin address:", admin);

  const isVerified = await contract.isVerifiedDoctor(doctorAddress);
  console.log("Doctor", doctorAddress, "verified:", isVerified);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
