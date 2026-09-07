# Como subir este repositório para o GitHub

Estes comandos assumem que você já extraiu este pacote numa pasta local
e está com o terminal aberto dentro dela.

## 1. Criar o repositório no GitHub

Pelo site do GitHub: New repository > escolha um nome (ex:
`volante-diy-firmware`) > **não** marque "Initialize with README" (já
temos um) > Create repository.

Copie a URL que o GitHub mostrar, algo como:
`https://github.com/SEU_USUARIO/volante-diy-firmware.git`

## 2. Inicializar e versionar localmente

```bash
cd volante-diy-firmware   # a pasta deste pacote

git init
git add .
git commit -m "Firmware inicial: ESP32-S3 BLE HID Gamepad + pagina de teste"
```

## 3. Conectar ao repositório remoto e enviar

```bash
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/volante-diy-firmware.git
git push -u origin main
```

Se pedir autenticação, o GitHub não aceita mais senha comum — use um
**Personal Access Token** (Settings > Developer settings > Personal
access tokens no site do GitHub) no lugar da senha, ou configure SSH.

## 4. Confirmar que subiu

Recarregue a página do repositório no navegador — os arquivos
`README.md`, `main/`, `server_teste/` etc. devem aparecer.

## Próximos commits (depois de mudanças)

```bash
git add .
git commit -m "Descreva o que mudou"
git push
```

## Se quiser manter histórico de versões do firmware (tags)

Útil para marcar "esta é a versão que testei e funcionou no Android
TV", por exemplo:

```bash
git tag -a v0.1 -m "Primeira versao testada no PC via Gamepad API"
git push origin v0.1
```
