const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const agentDir = path.join(rootDir, 'print-agent');
const installerDir = path.join(agentDir, 'installer');
const tmpDir = path.join(os.tmpdir(), 'samigen-print-agent-installer');
const payloadDir = path.join(tmpDir, 'payload');
const stagingDir = path.join(tmpDir, 'staging');
const downloadsDir = path.join(rootDir, 'public', 'downloads');
const packageJson = require(path.join(agentDir, 'package.json'));

const latestExeName = 'samigen-print-agent-setup.exe';
const versionedExeName = `samigen-print-agent-setup-${packageJson.version}.exe`;
const portableZipName = 'samigen-print-agent-portable.zip';
const versionedPortableZipName = `samigen-print-agent-portable-${packageJson.version}.zip`;
const tmpLatestExePath = path.join(tmpDir, latestExeName);
const latestExePath = path.join(downloadsDir, latestExeName);
const versionedExePath = path.join(downloadsDir, versionedExeName);
const portableZipPath = path.join(downloadsDir, portableZipName);
const versionedPortableZipPath = path.join(downloadsDir, versionedPortableZipName);

function assertFile(filePath, message) {
    if (!fs.existsSync(filePath)) {
        throw new Error(message || `Missing required file: ${filePath}`);
    }
}

function removeDir(dir) {
    fs.rmSync(dir, { recursive: true, force: true });
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}

function copyFile(source, target) {
    ensureDir(path.dirname(target));
    fs.copyFileSync(source, target);
}

function copyDir(source, target, options = {}) {
    const ignoredNames = new Set(options.ignoreNames || []);
    ensureDir(target);
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        if (ignoredNames.has(entry.name)) continue;
        const sourcePath = path.join(source, entry.name);
        const targetPath = path.join(target, entry.name);
        if (entry.isDirectory()) {
            copyDir(sourcePath, targetPath, options);
        } else if (entry.isFile()) {
            copyFile(sourcePath, targetPath);
        }
    }
}

function runPowerShell(command) {
    execFileSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
        { stdio: 'inherit' }
    );
}

function writeSedFile(sedPath) {
    const files = ['install-agent.cmd', 'install-agent.ps1', 'payload.zip'];
    const strings = files.map((file, index) => `FILE${index}="${file}"`).join('\r\n');
    const sourceEntries = files.map((_, index) => `%FILE${index}%=`).join('\r\n');
    const targetPath = tmpLatestExePath;
    const sourcePath = `${stagingDir}\\`;

    const content = `[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=0
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=6144
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=
TargetName=${targetPath}
FriendlyName=SamiGen Print Agent
AppLaunched=install-agent.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[Strings]
${strings}
[SourceFiles]
SourceFiles0=${sourcePath}
[SourceFiles0]
${sourceEntries}
`;

    fs.writeFileSync(sedPath, content, 'utf8');
}

function signIfConfigured(filePath) {
    const signtool = process.env.SIGNTOOL_PATH || 'signtool.exe';
    const certificate = process.env.PRINT_AGENT_SIGN_CERT;
    const password = process.env.PRINT_AGENT_SIGN_PASSWORD;
    const timestampUrl = process.env.PRINT_AGENT_TIMESTAMP_URL || 'http://timestamp.digicert.com';

    if (!certificate) {
        console.warn('[installer] PRINT_AGENT_SIGN_CERT no esta configurado; el EXE queda sin firma.');
        return;
    }

    const args = ['sign', '/f', certificate, '/tr', timestampUrl, '/td', 'sha256', '/fd', 'sha256'];
    if (password) args.push('/p', password);
    args.push(filePath);
    execFileSync(signtool, args, { stdio: 'inherit' });
}

function main() {
    assertFile(path.join(agentDir, 'server.js'));
    assertFile(path.join(agentDir, 'usbService.js'));
    assertFile(path.join(agentDir, 'printService.js'));
    assertFile(path.join(agentDir, 'node_modules'), 'Run npm install inside print-agent before building the installer.');
    assertFile(process.execPath, 'Current Node runtime was not found.');
    assertFile(path.join(installerDir, 'install-agent.cmd'));
    assertFile(path.join(installerDir, 'install-agent.ps1'));

    removeDir(tmpDir);
    ensureDir(payloadDir);
    ensureDir(stagingDir);
    ensureDir(downloadsDir);

    for (const file of ['server.js', 'usbService.js', 'printService.js', 'install-service.js', 'package.json', 'package-lock.json', 'README.md']) {
        copyFile(path.join(agentDir, file), path.join(payloadDir, file));
    }

    copyDir(path.join(agentDir, 'node_modules'), path.join(payloadDir, 'node_modules'));
    copyDir(installerDir, payloadDir, { ignoreNames: ['install-agent.cmd', 'install-agent.ps1'] });
    copyFile(process.execPath, path.join(payloadDir, 'runtime', 'node.exe'));

    const payloadZip = path.join(stagingDir, 'payload.zip');
    runPowerShell(`Compress-Archive -Path "${payloadDir}\\*" -DestinationPath "${payloadZip}" -Force`);
    copyFile(payloadZip, portableZipPath);
    copyFile(payloadZip, versionedPortableZipPath);
    copyFile(path.join(installerDir, 'install-agent.cmd'), path.join(stagingDir, 'install-agent.cmd'));
    copyFile(path.join(installerDir, 'install-agent.ps1'), path.join(stagingDir, 'install-agent.ps1'));

    const sedPath = path.join(tmpDir, 'samigen-print-agent.sed');
    writeSedFile(sedPath);
    execFileSync('iexpress.exe', ['/N', '/Q', sedPath], { stdio: 'inherit' });

    assertFile(tmpLatestExePath, 'IExpress did not create the installer.');
    copyFile(tmpLatestExePath, latestExePath);
    copyFile(tmpLatestExePath, versionedExePath);
    signIfConfigured(latestExePath);
    signIfConfigured(versionedExePath);

    console.log(`[installer] Created ${latestExePath}`);
    console.log(`[installer] Created ${versionedExePath}`);
    console.log(`[installer] Created ${portableZipPath}`);
    console.log(`[installer] Created ${versionedPortableZipPath}`);
}

main();
