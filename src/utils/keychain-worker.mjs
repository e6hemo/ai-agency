import keytar from 'keytar';

const SERVICE_NAME = 'OpenClaude';

async function run() {
  const [cmd, account, secret] = process.argv.slice(2);

  try {
    if (cmd === 'set') {
      await keytar.setPassword(SERVICE_NAME, account, secret);
    } else if (cmd === 'get') {
      const result = await keytar.getPassword(SERVICE_NAME, account);
      if (result) {
        process.stdout.write(result);
      }
    } else if (cmd === 'delete') {
      await keytar.deletePassword(SERVICE_NAME, account);
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
