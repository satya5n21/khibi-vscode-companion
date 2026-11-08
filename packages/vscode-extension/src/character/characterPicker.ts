import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CharacterPackInfo, discoverCharacters } from '@khibi/shared';
import { SettingsManager } from '../config/settings';

/** Where the built-in packs ship (next to the Electron companion). */
export function getBuiltinCharactersDir(extensionRootPath: string): string {
    return path.resolve(extensionRootPath, '../companion-app/characters');
}

export function listCharacterPacks(
    extensionRootPath: string,
    settingsManager: SettingsManager
): ReturnType<typeof discoverCharacters> {
    return discoverCharacters([
        { dir: getBuiltinCharactersDir(extensionRootPath), source: 'builtin' },
        ...settingsManager
            .getSettings()
            .customCharacterRoots.map((dir) => ({ dir, source: 'user' as const }))
    ]);
}

interface PackItem extends vscode.QuickPickItem {
    pack: CharacterPackInfo;
}

/** "Khibi: Choose Character" – quick-pick of every valid pack; applies live. */
export async function pickCharacter(
    extensionRootPath: string,
    settingsManager: SettingsManager
): Promise<void> {
    const { packs, errors } = listCharacterPacks(extensionRootPath, settingsManager);
    const current = settingsManager.getSettings().character;

    const items: PackItem[] = packs.map((pack) => ({
        label: `${pack.id === current ? '$(check) ' : ''}${pack.name}`,
        description: [pack.kind === 'svg' ? 'vector' : 'images', pack.source === 'user' ? 'yours' : 'built-in']
            .join(' · '),
        detail: pack.description ?? (pack.author ? `by ${pack.author}` : undefined),
        pack
    }));

    const picked = await vscode.window.showQuickPick(items, {
        title: 'Choose your coding companion',
        placeHolder: 'Pick a character – it switches instantly',
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (errors.length > 0) {
        void vscode.window.showWarningMessage(
            `Khibi skipped ${errors.length} character pack(s): ${errors.slice(0, 2).join('; ')}${errors.length > 2 ? '…' : ''}`
        );
    }
    if (picked) {
        await settingsManager.updateSetting('character', picked.pack.id);
    }
}

/** Creates (if needed) and reveals the folder where users drop their own packs. */
export async function openUserCharactersFolder(userDir: string): Promise<void> {
    await fs.promises.mkdir(userDir, { recursive: true });
    const readme = path.join(userDir, 'README.txt');
    if (!fs.existsSync(readme)) {
        await fs.promises.writeFile(
            readme,
            [
                'Put one folder per character in here, e.g.:',
                '',
                '  my-hero/',
                '    character.json',
                '    normal.png  happy.png  sad.png ...',
                '',
                'Folder names: lowercase letters, digits, "-" or "_".',
                'Then run "Khibi: Choose Character" from the Command Palette.',
                'Format + AI prompts: docs/CHARACTER_GUIDE.md in the Khibi repo.',
                ''
            ].join('\n')
        );
    }
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(readme));
}
