
$path = "\\?\usb#vid_2d84&pid_4cfb#00008532110051367077#{28d78fad-5a12-11d1-ae5b-0000f803a8c2}";
$zplFile = "C:\Users\oswaldo.rivera\Desktop\Proyecto IA - Documentacion tecnica automatica\print-agent\.tmp-zpl-1780411057187.zpl";
Add-Type -TypeDefinition @"

using System;
using System.IO;
using System.Threading.Tasks;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public class USBWriter {
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Auto)]
    public static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr sec, uint create, uint flags, IntPtr tmpl);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool CancelIo(IntPtr h);

    public static string WriteToPort(string port, string dataFile) {
        IntPtr h = CreateFile(port, 0x40000000, 0, IntPtr.Zero, 3, 0x40000000, IntPtr.Zero);
        if (h.ToInt64() == -1) return "ERR_CREATE:" + Marshal.GetLastWin32Error();
        try {
            byte[] bytes = File.ReadAllBytes(dataFile);
            var safeHandle = new SafeFileHandle(h, false);
            using (var fs = new FileStream(safeHandle, FileAccess.Write, 4096, true)) {
                var task = fs.WriteAsync(bytes, 0, bytes.Length);
                if (task.Wait(TimeSpan.FromSeconds(15))) {
                    fs.Flush();
                    return "OK:" + bytes.Length;
                }
                CancelIo(h);
                return "ERR_TIMEOUT:15s";
            }
        } finally {
            CloseHandle(h);
        }
    }
}

"@;
$r = [USBWriter]::WriteToPort($path, $zplFile);
Write-Host $r;
