import { expect } from "chai";
import hre from "hardhat";
const { ethers } = hre;

describe("BillingHistory", function () {
  let billing;
  let admin, hospital1, hospital2, unauthorizedUser;

  beforeEach(async function () {
    [admin, hospital1, hospital2, unauthorizedUser] = await ethers.getSigners();

    const BillingHistory = await ethers.getContractFactory("BillingHistory");
    billing = await BillingHistory.deploy();
    await billing.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the deployer as admin", async function () {
      expect(await billing.admin()).to.equal(admin.address);
    });

    it("Should start with zero MC count", async function () {
      expect(await billing.getMCCount()).to.equal(0);
    });

    it("Should start hospitals with zero balance", async function () {
      expect(await billing.getHospitalBalance(hospital1.address)).to.equal(0);
    });
  });

  describe("issueDigitalMC", function () {
    it("Should record MC issuance and deduct 1 credit", async function () {
      await expect(billing.connect(hospital1).issueDigitalMC(hospital1.address))
        .to.emit(billing, "MCIssued");

      expect(await billing.getHospitalBalance(hospital1.address)).to.equal(-1);
      expect(await billing.getMCCount()).to.equal(1);
    });

    it("Should allow multiple MC issuances", async function () {
      await billing.issueDigitalMC(hospital1.address);
      await billing.issueDigitalMC(hospital1.address);
      await billing.issueDigitalMC(hospital1.address);

      expect(await billing.getHospitalBalance(hospital1.address)).to.equal(-3);
      expect(await billing.getMCCount()).to.equal(3);
    });

    it("Should track MC history correctly", async function () {
      await billing.issueDigitalMC(hospital1.address);
      await billing.issueDigitalMC(hospital2.address);

      const history = await billing.getMCHistory();
      expect(history.length).to.equal(2);
      expect(history[0].hospital).to.equal(hospital1.address);
      expect(history[1].hospital).to.equal(hospital2.address);
    });

    it("Should deduct from prepaid credits first", async function () {
      // Admin gives hospital1 5 credits
      await billing.connect(admin).addCredits(hospital1.address, 5);
      expect(await billing.getHospitalBalance(hospital1.address)).to.equal(5);

      // Hospital issues 3 MCs
      await billing.issueDigitalMC(hospital1.address);
      await billing.issueDigitalMC(hospital1.address);
      await billing.issueDigitalMC(hospital1.address);

      expect(await billing.getHospitalBalance(hospital1.address)).to.equal(2);
    });

    it("Should go negative when credits exhausted", async function () {
      await billing.connect(admin).addCredits(hospital1.address, 2);

      // Issue 5 MCs (2 prepaid + 3 debt)
      for (let i = 0; i < 5; i++) {
        await billing.issueDigitalMC(hospital1.address);
      }

      expect(await billing.getHospitalBalance(hospital1.address)).to.equal(-3);
    });

    it("Should reject zero address", async function () {
      await expect(
        billing.issueDigitalMC(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid hospital address");
    });
  });

  describe("getHospitalBalance", function () {
    it("Should return correct balance after credits added", async function () {
      await billing.connect(admin).addCredits(hospital1.address, 10);
      expect(await billing.getHospitalBalance(hospital1.address)).to.equal(10);
    });

    it("Should return negative balance (debt)", async function () {
      await billing.issueDigitalMC(hospital1.address);
      await billing.issueDigitalMC(hospital1.address);
      expect(await billing.getHospitalBalance(hospital1.address)).to.equal(-2);
    });
  });

  describe("addCredits (Admin)", function () {
    it("Should allow admin to add credits", async function () {
      await expect(billing.connect(admin).addCredits(hospital1.address, 10))
        .to.emit(billing, "CreditsAdded")
        .withArgs(hospital1.address, 10, 10);

      expect(await billing.getHospitalBalance(hospital1.address)).to.equal(10);
    });

    it("Should not allow non-admin to add credits", async function () {
      await expect(
        billing.connect(hospital1).addCredits(hospital1.address, 10)
      ).to.be.revertedWith("Only admin can call this function");
    });

    it("Should not allow adding credits to zero address", async function () {
      await expect(
        billing.connect(admin).addCredits(ethers.ZeroAddress, 10)
      ).to.be.revertedWith("Invalid hospital address");
    });

    it("Should not allow adding zero credits", async function () {
      await expect(
        billing.connect(admin).addCredits(hospital1.address, 0)
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should allow adding credits to pay off debt", async function () {
      // Hospital goes into debt
      await billing.issueDigitalMC(hospital1.address);
      await billing.issueDigitalMC(hospital1.address);
      expect(await billing.getHospitalBalance(hospital1.address)).to.equal(-2);

      // Admin adds credits to cover debt
      await billing.connect(admin).addCredits(hospital1.address, 5);
      expect(await billing.getHospitalBalance(hospital1.address)).to.equal(3);
    });
  });

  describe("getHospitalMCHistory", function () {
    it("Should return only MCs for specific hospital", async function () {
      await billing.issueDigitalMC(hospital1.address);
      await billing.issueDigitalMC(hospital2.address);
      await billing.issueDigitalMC(hospital1.address);
      await billing.issueDigitalMC(hospital2.address);
      await billing.issueDigitalMC(hospital1.address);

      const hospital1History = await billing.getHospitalMCHistory(hospital1.address);
      const hospital2History = await billing.getHospitalMCHistory(hospital2.address);

      expect(hospital1History.length).to.equal(3);
      expect(hospital2History.length).to.equal(2);
    });

    it("Should return empty array for hospital with no MCs", async function () {
      const history = await billing.getHospitalMCHistory(hospital1.address);
      expect(history.length).to.equal(0);
    });
  });
});

// Helper to get current block timestamp
async function getBlockTimestamp() {
  const block = await ethers.provider.getBlock("latest");
  return block.timestamp;
}
