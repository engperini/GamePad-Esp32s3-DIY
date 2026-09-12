"""Temporarily join this console; always restore the supplied Windows Wi-Fi profile."""
import re
import subprocess
import sys
import time
from pathlib import Path
from xml.sax.saxutils import escape

root = Path(__file__).resolve().parents[1]
credentials = (root/'backups/ACESSO-CONSOLE.txt').read_text(encoding='utf-8')
ssid = re.search(r'Rede: (.+)', credentials)[1]
profile = root/'backups/console-wifi-profile.xml'
profile.write_text(f'''<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>{escape(ssid)}</name><SSIDConfig><SSID><name>{escape(ssid)}</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>manual</connectionMode><MSM><security><authEncryption><authentication>open</authentication><encryption>none</encryption><useOneX>false</useOneX></authEncryption></security></MSM></WLANProfile>''', encoding='utf-8')
def netsh(*args):
    result = subprocess.run(['netsh','wlan',*args],capture_output=True)
    print(result.stdout.decode('utf-8', 'replace'))
    return result
try:
    netsh('delete','profile',f'name={ssid}')
    netsh('add','profile',f'filename={profile}','user=current')
    netsh('connect',f'name={ssid}')
    time.sleep(7)
    result = subprocess.run(['node','tests/check_console_live.cjs','http://192.168.4.1',*sys.argv[2:]],cwd=root,timeout=75)
finally:
    netsh('connect',f'name={sys.argv[1]}')
    time.sleep(5)
    profile.unlink(missing_ok=True)
sys.exit(result.returncode)
