// Quick and dirty helper script to create the license overview page in markdown for the remote-ui.
//
// Usage:
// license-checker --json > licenses.json
// node transform-license-checker.js licenses.json licenses.md

const fs = require("fs");
const {execSync} = require("child_process");

const TIMEOUT = 10000;

function ensureFileExists(file) {
    if (!fs.existsSync(file)) {
        console.error(`File does not exist: ${file}`);
        process.exit(1);
    }
}

function getLocalLicensePatch(module) {
    const patchedLicense = `patches/${module}/LICENSE`;
    if (fs.existsSync(patchedLicense)) {
        console.log(`Using a license patch for: ${module}`);
        return patchedLicense;
    }
}

function getLicensePatch(module, repository) {
    const licenseFile = getLocalLicensePatch(module);
    if (licenseFile) {
        return licenseFile;
    }

    const patchPath = `patches/${module}`;
    fs.mkdirSync(patchPath, {recursive: true});

    downloadLicenseFromGitHub(repository, patchPath + "/LICENSE");

    return getLocalLicensePatch(module);
}

function getGitHubDefaultBranch(url) {
    const branch = execSync(`gh repo view --json defaultBranchRef --jq .defaultBranchRef.name ${url}`, {
        timeout: TIMEOUT,
        encoding: "utf-8"
    });

    return branch.trim();
}

function downloadGitHubFile(url, file) {
    console.log(`Downloading file from ${url} to ${file}`)
    try {
        const branch = execSync(`curl -L --fail --no-progress-meter --connect-timeout 10 -o ${file} ${url}`);
        return true;
    } catch (e) {
        console.log(e.message);
    }
    return false;
}

function downloadLicenseFromGitHub(repository, file) {
    const licenseNames = ["LICENSE", "LICENCE", "LICENSE.md"];

    if (!repository) {
        console.warn("WARN: repository not defined");
        return false;
    }

    const branch = getGitHubDefaultBranch(repository);

    for (const licenseName of licenseNames) {
        if (downloadGitHubFile(`${repository}/raw/${branch}/${licenseName}`, file)) {
            return true;
        }
    }

    return false;
}

if (process.argv.length < 4) {
    console.error("Expected two argument: <licenses.json> <output.md>");
    process.exit(1);
}

const licenseFile = process.argv[2];
const outputFile = process.argv[3];

ensureFileExists(licenseFile);

const licenses = JSON.parse(fs.readFileSync(licenseFile, "utf-8"));

fs.writeFileSync(outputFile, fs.readFileSync("templates/licenses-header.md", "utf-8"), "utf-8");

for (const module in licenses) {
    if (module.startsWith("uc-integration") && ! module.startsWith("uc-integration-api")) {
        console.warn(`WARN skipping: ${module}`);
        continue;
    }
    console.log(`${module}: ${licenses[module].licenses}`);

    let repository = licenses[module].repository;
    let license = licenses[module].licenses;

    // manual license fix until corrected in package.json
    if (module.startsWith("uc-integration-api") && license.toUpperCase() === "UNLICENSED") {
        license = "Apache-2.0";
    }

    fs.appendFileSync(outputFile, `#### ${module}\n`, "utf-8");
    fs.appendFileSync(outputFile, `License: ${license}  \n`, "utf-8");
    if (repository) {
        fs.appendFileSync(outputFile, `This software may be included in this product and a copy of the source code may be downloaded from: ${repository}.\n`, "utf-8");
    }

    let licenseFile = licenses[module].licenseFile;
    if (!licenseFile) {
        licenseFile = getLicensePatch(module, repository);
    }

    if (!licenseFile) {
        console.error(`ERROR: ${module} (${licenses[module].licenses}) no license file found!`);
        continue;
    }

    // special handling for invalid metadata.
    // Quick and dirty: all README.md references turned out to be invalid. THIS MIGHT CHANGE ANYTIME!!!
    if (licenseFile.endsWith("README.md")) {
        if (licenses[module].licenses === "Unlicense") {
            licenseFile = licenseFile.replace("README.md", "UNLICENSE");
        } else {
            licenseFile = getLicensePatch(module, repository);
            if (!licenseFile) {
                console.error(`ERROR: ${module} (${licenses[module].licenses}) no license patch for (most likely) invalid README.md!`);
                continue;
            }
        }
    }

    fs.appendFileSync(outputFile, "\n```\n", "utf-8");
    fs.appendFileSync(outputFile, fs.readFileSync(`${licenseFile}`, "utf-8").trim(), "utf-8");
    fs.appendFileSync(outputFile, "\n```\n\n", "utf-8");
}

fs.appendFileSync(outputFile, fs.readFileSync("templates/licenses-footer.md", "utf-8"), "utf-8");
