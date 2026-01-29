const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = __dirname;
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');

const processes = [];

function log(service, message) {
  console.log(`[${service}] ${message}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForHardhat() {
  const http = require('http');
  for (let i = 0; i < 30; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: 8545, method: 'POST', timeout: 1000 }, (res) => {
          resolve(true);
        });
        req.on('error', reject);
        req.write(JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }));
        req.end();
      });
      return true;
    } catch (e) {
      await sleep(500);
    }
  }
  return false;
}

async function deployContract() {
  return new Promise((resolve, reject) => {
    log('DEPLOY', 'Deploying contracts to localhost network...');
    const deploy = spawn('npx', ['hardhat', 'run', 'scripts/deploy.cjs', '--network', 'localhost'], { cwd: ROOT_DIR, shell: true });

    let output = '';
    deploy.stdout.on('data', (data) => {
      output += data.toString();
      process.stdout.write(data);
    });
    deploy.stderr.on('data', (data) => {
      process.stderr.write(data);
    });
    deploy.on('close', (code) => {
      if (code === 0) {
        // Extract contract addresses from output
        const mainMatch = output.match(/VITE_CONTRACT_ADDRESS=(\S+)/);
        const billingMatch = output.match(/VITE_BILLING_CONTRACT_ADDRESS=(\S+)/);

        if (mainMatch && billingMatch) {
          // Update frontend .env
          const envPath = path.join(FRONTEND_DIR, '.env');
          const envContent = `VITE_API_BASE_URL=http://localhost:3001
VITE_CONTRACT_ADDRESS=${mainMatch[1]}
VITE_BILLING_CONTRACT_ADDRESS=${billingMatch[1]}
`;
          fs.writeFileSync(envPath, envContent);
          log('DEPLOY', 'Updated frontend/.env with contract addresses');
        }
        resolve();
      } else {
        reject(new Error(`Deploy failed with code ${code}`));
      }
    });
  });
}

function startService(name, command, args, cwd, waitForText) {
  return new Promise((resolve) => {
    log(name, `Starting...`);
    const proc = spawn(command, args, { cwd, shell: true });
    processes.push({ name, proc });

    let resolved = false;

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      if (!resolved && waitForText && text.includes(waitForText)) {
        resolved = true;
        log(name, 'Ready!');
        resolve();
      }
      // Show output
      text.split('\n').forEach(line => {
        if (line.trim()) log(name, line);
      });
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      if (!resolved && waitForText && text.includes(waitForText)) {
        resolved = true;
        log(name, 'Ready!');
        resolve();
      }
    });

    proc.on('error', (err) => {
      log(name, `Error: ${err.message}`);
    });

    // Resolve after timeout if no wait text
    if (!waitForText) {
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }, 2000);
    }
  });
}

async function main() {
  console.log('\n========================================');
  console.log('  Sarawak MedChain - Starting All Services');
  console.log('========================================\n');

  // 1. Start IPFS daemon
  startService('IPFS', 'ipfs', ['daemon'], ROOT_DIR, 'Daemon is ready');

  // 2. Start Hardhat node
  startService('HARDHAT', 'npx', ['hardhat', 'node'], ROOT_DIR, 'Started HTTP');

  // Wait for Hardhat to be ready
  log('MAIN', 'Waiting for Hardhat node...');
  await sleep(3000);
  const hardhatReady = await waitForHardhat();

  if (!hardhatReady) {
    console.error('Hardhat node failed to start!');
    process.exit(1);
  }
  log('MAIN', 'Hardhat node is ready!');

  // 3. Deploy contracts
  await deployContract();

  // 4. Start backend
  startService('BACKEND', 'npm', ['start'], BACKEND_DIR, 'Server running');
  await sleep(2000);

  // 5. Start frontend
  startService('FRONTEND', 'npm', ['run', 'dev'], FRONTEND_DIR, 'ready in');
  await sleep(2000);

  console.log('\n========================================');
  console.log('  All services started!');
  console.log('========================================');
  console.log('  Frontend:  http://localhost:5173');
  console.log('  Backend:   http://localhost:3001');
  console.log('  Hardhat:   http://localhost:8545');
  console.log('  IPFS API:  http://localhost:5001');
  console.log('========================================');
  console.log('  Press Ctrl+C to stop all services');
  console.log('========================================\n');
}

// Handle cleanup on exit
process.on('SIGINT', () => {
  console.log('\nShutting down all services...');
  processes.forEach(({ name, proc }) => {
    log(name, 'Stopping...');
    proc.kill();
  });
  process.exit(0);
});

process.on('SIGTERM', () => {
  processes.forEach(({ proc }) => proc.kill());
  process.exit(0);
});

main().catch(console.error);
