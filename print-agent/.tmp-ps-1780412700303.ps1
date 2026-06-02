
$path = "\\?\usb#vid_2d84&pid_4cfb#00008532110051367077#{28d78fad-5a12-11d1-ae5b-0000f803a8c2}";
$zplFile = "C:\Users\oswaldo.rivera\Desktop\Proyecto IA - Documentacion tecnica automatica\print-agent\.tmp-zpl-1780412700303.zpl";
Add-Type -TypeDefinition @"

using System;
using System.IO;
using System.Runtime.InteropServices;
public class USBWriter {
    [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Auto)]
    public static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr sec, uint create, uint flags, IntPtr tmpl);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool WriteFile(IntPtr h, byte[] d, uint n, out uint w, IntPtr ov);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool CloseHandle(IntPtr h);

    public static string WriteToPort(string port, string dataFile) {
        IntPtr h = CreateFile(port, 0x40000000, 0, IntPtr.Zero, 3, 0, IntPtr.Zero);
        if (h.ToInt64() == -1) return "ERR_CREATE:" + Marshal.GetLastWin32Error();
        try {
            byte[] bytes = File.ReadAllBytes(dataFile);
            uint written;
            if (!WriteFile(h, bytes, (uint)bytes.Length, out written, IntPtr.Zero))
                return "ERR_WRITE:" + Marshal.GetLastWin32Error();
            return "OK:" + written;
        } finally {
            CloseHandle(h);
        }
    }
}

"@;
$r = [USBWriter]::WriteToPort($path, $zplFile);
Write-Host $r;
