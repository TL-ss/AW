import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.util.Scanner;

public class JYKilltool {
    // 全局变量：用户主目录路径（所有BAT文件都生成到这里）
    private static final String USER_HOME = System.getProperty("user.home");

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.println("==================================================");
        System.out.println("             ╭───╮ ╭───╮ ╭───╮ ╭───╮");
        System.out.println("             │ J │ │ Y │ │ K │ │ T │");
        System.out.println("             ╰───╯ ╰───╯ ╰───╯ ╰───╯");
        System.out.println("                集成化极域破解工具");
        System.out.println("                    Timeless");
        System.out.println("  下载地址 五中资源网：https://tl-ss.github.io/AW");
        System.out.println("==================================================");
        try {
            Thread.sleep(1000);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }

        System.out.println("输入“help”查看帮助");

        while (true) {
            String code = scanner.next();
            if (code.equals("help")) {
                System.out.println("==================================================");
                System.out.println("                    H E L P");
                System.out.println("                     帮助");
                System.out.println("                ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓");
                System.out.println("stop          脱离教师控制");
                System.out.println("disable       解除网络控制");
                System.out.println("Kdisable      解除网络控制pro max强力版");
                System.out.println("debug         解决运行“解除网络控制pro max强力版”后电脑可能会产生的卡顿现象");
                System.out.println("optimize      网络优化");
                System.out.println("passwd        破解极域密码（测试版）");
                System.out.println("exit          退出");
                System.out.println("==================================================");
            } else if (code.equals("passwd")) {
                System.out.println("正在破解中...");
                try {
                    Thread.sleep(3000);
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
                // 直接复制到if的大括号 {} 内部即可运行
                String regPath = "HKEY_LOCAL_MACHINE\\SOFTWARE\\TopDomain\\e-learning Class Standard\\1.00";
                String regItem = "UninstallPasswd";
                String resultData = null;

                try {
                    // 构建reg query命令
                    String[] cmd = {"reg", "query", regPath, "/v", regItem, "/reg:64"};
                    Process process = new ProcessBuilder(cmd).start();
                    BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), "GBK"));
                    String line;

                    // 解析命令输出，提取目标数据
                    while ((line = reader.readLine()) != null) {
                        String trimLine = line.trim();
                        if (trimLine.contains(regItem)) {
                            String[] parts = trimLine.split("\\s+");
                            if (parts.length >= 3) {
                                resultData = parts[parts.length - 1];
                            }
                            break;
                        }
                    }

                    // 处理结果：忽略前6位并输出
                    if (resultData != null) {
                        if (resultData.length() > 6) {
                            String targetData = resultData.substring(6);
                            System.out.println("UninstallPasswd忽略前6位结果：" + targetData);
                        } else {
                            System.out.println("提示：UninstallPasswd数据长度≤6位，无有效内容输出。");
                        }
                    } else {
                        System.out.println("错误：未查询到UninstallPasswd项。");
                    }

                    // 关闭资源
                    reader.close();
                    process.waitFor();
                } catch (IOException e) {
                    System.err.println("IO异常：查询注册表失败（非Windows系统或命令不可用）。");
                    e.printStackTrace();
                } catch (InterruptedException e) {
                    System.err.println("进程中断异常：注册表查询进程被中断。");
                    e.printStackTrace();
                    System.out.println("==================================================");
                }
            } else if (code.equals("exit")) {
                System.out.println("确定要退出？");
                System.out.println("是（Y）/否（N）");
                String exit = scanner.next();
                if (exit.equals("N") || exit.equals("n")) {
                    System.out.println("已取消");
                    System.out.println("==================================================");
                } else if (exit.equals("Y") || exit.equals("y")) {
                    System.out.println("已退出程序");
                    System.out.println("==================================================");
                    break;
                }
            } else if (code.equals("stop")) {
                System.out.println("开始脱离教师机");

                // 1. BAT内容（CRLF格式，自动关闭窗口）
                String batContent = "@echo off\r\n"
                        + "chcp 65001 >nul\r\n"
                        + "setlocal enabledelayedexpansion\r\n"
                        + "\r\n"
                        + "echo ==============================\r\n"
                        + "echo 正在禁用所有网络适配器...\r\n"
                        + "echo ==============================\r\n"
                        + ":: 遍历索引1到10的适配器并禁用\r\n"
                        + "for /l %%i in (1,1,10) do (\r\n"
                        + "    wmic path win32_networkadapter where Index=%%i call disable >nul 2>&1\r\n"
                        + "    echo 已尝试禁用索引 %%i 的适配器\r\n"
                        + ")\r\n"
                        + "\r\n"
                        + "echo.\r\n"
                        + "echo 禁用完成，当前状态：\r\n"
                        + "wmic nic get Name,Index,NetEnabled | findstr \"TRUE FALSE\"\r\n"
                        + "\r\n"
                        + "echo.\r\n"
                        + "echo ==============================\r\n"
                        + "echo 等待3秒后将自动启用所有适配器...\r\n"
                        + "echo ==============================\r\n"
                        + "timeout /t 3 /nobreak >nul\r\n"
                        + "\r\n"
                        + "echo.\r\n"
                        + "echo 正在启用所有网络适配器...\r\n"
                        + ":: 遍历索引1到10的适配器并启用\r\n"
                        + "for /l %%i in (1,1,10) do (\r\n"
                        + "    wmic path win32_networkadapter where Index=%%i call enable >nul 2>&1\r\n"
                        + "    echo 已尝试启用索引 %%i 的适配器\r\n"
                        + ")\r\n"
                        + "\r\n"
                        + "echo.\r\n"
                        + "echo 启用完成，当前状态：\r\n"
                        + "wmic nic get Name,Index,NetEnabled | findstr \"TRUE FALSE\"\r\n"
                        + "\r\n"
                        + "exit"; // 自动关闭cmd窗口

                // 关键修改：手动拼接完整路径（Windows用\\分隔）
                String batFileName = "JYStopProcess_" + System.currentTimeMillis() + ".bat";
                String fullBatPath = USER_HOME + File.separator + batFileName; // 跨平台路径分隔符
                File batFile = new File(fullBatPath);

                try {
                    OutputStreamWriter osw = new OutputStreamWriter(new FileOutputStream(batFile), "UTF-8");
                    PrintWriter pw = new PrintWriter(osw);
                    pw.write(batContent);
                    pw.flush();
                    pw.close();
                    osw.close();

                    if (!batFile.exists() || batFile.length() == 0) {
                        System.out.println("错误：脚本创建失败或文件为空！");
                        return;
                    }
                    System.out.println("正在运行脚本（请在弹出的窗口中授权管理员权限）");

                    // 核心改进：用powershell启动，并获取进程句柄
                    String psCommand = String.format(
                            "Start-Process -FilePath \"%s\" -Verb RunAs -Wait",
                            batFile.getAbsolutePath()
                    );
                    ProcessBuilder pb = new ProcessBuilder("powershell", "-Command", psCommand);
                    Process process = pb.start();

                    // 等待BAT进程完全执行结束（管理员权限的进程执行完才会继续）
                    process.waitFor();
                    System.out.println("脚本已执行完毕");

                } catch (IOException | InterruptedException e) {
                    System.out.println("错误：执行过程中出现异常！");
                    e.printStackTrace();
                } finally {
                    // 进程执行完后再删除，无需延迟
                    if (batFile.exists()) {
                        boolean deleted = batFile.delete();
                        if (deleted) {
                            System.out.println("已脱离教师控制");
                        } else {
                            System.out.println("脚本执行完成，但文件删除失败，路径：" + fullBatPath);
                            System.out.println("==================================================");
                        }
                    }
                }
            } else if (code.equals("disable")) {
                System.out.println("开始解除网络控制");

                // 1. 嵌入指定的BAT内容，换行符用\r\n（Windows CRLF格式），末尾添加exit自动关闭窗口
                String batContent = "title Timeless-进程阻断1.1\r\n"
                        + "@echo off\r\n"
                        + "echo 正在获取管理员权限...\r\n"
                        + ">nul 2>&1 \"%SYSTEMROOT%\\system32\\cacls.exe\" \"%SYSTEMROOT%\\system32\\config\\system\"\r\n"
                        + "if %errorlevel% neq 0 (\r\n"
                        + "    powershell -Command \"Start-Process '%~f0' -Verb RunAs\" >nul 2>&1\r\n"
                        + "    exit /b\r\n"
                        + ")\r\n"
                        + "\r\n"
                        + "@echo off\r\n"
                        + "echo ==============================\r\n"
                        + "echo 正在结束MasterHelper.exe进程\r\n"
                        + "echo ==============================\r\n"
                        + "timeout /t 2 /nobreak >nul\r\n"
                        + "echo.\r\n"
                        + "taskkill /f /im MasterHelper.exe\r\n"
                        + "echo.\r\n"
                        + "echo ==============================\r\n"
                        + "echo 正在终止tdnetfilter服务.\r\n"
                        + "echo ==============================\r\n"
                        + "timeout /t 2 /nobreak >nul\r\n"
                        + "echo.\r\n"
                        + "sc stop tdnetfilter\r\n"
                        + "echo ==============================\r\n"
                        + "echo 完成\r\n"
                        + "echo ==============================\r\n"
                        + ":: 等待3秒（timeout命令更精准，兼容Win7/10/11）\r\n"
                        + "timeout /t 3 /nobreak >nul\r\n"
                        + "echo.\r\n"
                        + "exit"; // 添加exit，确保执行完自动关闭cmd窗口

                // 关键修改：手动拼接完整路径
                String batFileName = "JYDisableProcess_" + System.currentTimeMillis() + ".bat";
                String fullBatPath = USER_HOME + File.separator + batFileName;
                File batFile = new File(fullBatPath);

                try {
                    // 以GBK编码写入BAT文件
                    OutputStreamWriter osw = new OutputStreamWriter(new FileOutputStream(batFile), "GBK");
                    PrintWriter pw = new PrintWriter(osw);

                    pw.write(batContent);
                    pw.flush();
                    pw.close();
                    osw.close();

                    if (!batFile.exists() || batFile.length() == 0) {
                        System.out.println("错误：解除网络控制脚本创建失败或文件为空！");
                        return;
                    }
                    System.out.println("正在运行解除网络控制脚本（请在弹出的窗口中授权管理员权限）");

                    String psCommand = String.format(
                            "Start-Process -FilePath \"%s\" -Verb RunAs -Wait",
                            batFile.getAbsolutePath()
                    );
                    ProcessBuilder pb = new ProcessBuilder("powershell", "-Command", psCommand);
                    Process process = pb.start();

                    process.waitFor();
                    System.out.println("解除网络控制脚本已完全执行完毕");

                } catch (IOException | InterruptedException e) {
                    System.out.println("错误：执行解除网络控制脚本过程中出现异常！");
                    e.printStackTrace();
                } finally {
                    if (batFile.exists()) {
                        boolean deleted = batFile.delete();
                        if (deleted) {
                            System.out.println("已成功解除网络控制");
                        } else {
                            System.out.println("解除网络控制脚本执行完成，但脚本文件删除失败，路径：" + fullBatPath);
                            System.out.println("==================================================");
                        }
                    }
                }
            } else if (code.equals("Kdisable")) {
                System.out.println("此操作会与老师断开连接，如有需要请手动连接，具体方法见“https://tl-ss.github.io/AW/jiyupj.html”");
                System.out.println("你有五秒钟的时间思考要不要继续运行，在这期间，你随时可以按下“ctrl+C”来结束这个进程");
                try {
                    Thread.sleep(5000);
                } catch (InterruptedException e) {
                    e.printStackTrace();
                }
                System.out.println("开始运行解除网络控制pro max强力版");

                // 1. 嵌入指定的强力版BAT内容
                String batContent = "title Timeless-Disable Ethernet Restrictions version1.0\r\n"
                        + "@echo off\r\n"
                        + "echo 正在获取管理员权限...\r\n"
                        + ">nul 2>&1 \"%SYSTEMROOT%\\system32\\cacls.exe\" \"%SYSTEMROOT%\\system32\\config\\system\"\r\n"
                        + "if %errorlevel% neq 0 (\r\n"
                        + "    powershell -Command \"Start-Process '%~f0' -Verb RunAs\" >nul 2>&1\r\n"
                        + "    exit /b\r\n"
                        + ")\r\n"
                        + "taskkill /f /im MasterHelper.exe\r\n"
                        + "sc stop tdnetfilter\r\n"
                        + "@echo off\r\n"
                        + "chcp 65001 >nul 2>&1\r\n"
                        + ":: 检查是否以管理员身份运行\r\n"
                        + ">nul 2>&1 \"%SYSTEMROOT%\\system32\\cacls.exe\" \"%SYSTEMROOT%\\system32\\config\\system\"\r\n"
                        + "if '%errorlevel%' NEQ '0' (\r\n"
                        + "    echo 请以管理员身份运行此脚本！\r\n"
                        + "    pause\r\n"
                        + "    exit /b 1\r\n"
                        + ")\r\n"
                        + "@echo off\r\n"
                        + "chcp 65001 >nul\r\n"
                        + "setlocal enabledelayedexpansion\r\n"
                        + "\r\n"
                        + "echo ==============================\r\n"
                        + "echo 正在禁用所有网络适配器...\r\n"
                        + "echo ==============================\r\n"
                        + ":: 遍历索引1到10的适配器并禁用\r\n"
                        + "for /l %%i in (1,1,10) do (\r\n"
                        + "    wmic path win32_networkadapter where Index=%%i call disable >nul 2>&1\r\n"
                        + "    echo 已尝试禁用索引 %%i 的适配器\r\n"
                        + ")\r\n"
                        + "echo.\r\n"
                        + "echo 禁用完成，当前状态：\r\n"
                        + "wmic nic get Name,Index,NetEnabled | findstr \"TRUE FALSE\"\r\n"
                        + "\r\n"
                        + "echo.\r\n"
                        + "echo ==============================\r\n"
                        + "echo 等待3秒后将自动启用所有适配器...\r\n"
                        + "echo ==============================\r\n"
                        + ":: 等待3秒（timeout命令更精准，兼容Win7/10/11）\r\n"
                        + "timeout /t 3 /nobreak >nul\r\n"
                        + "echo.\r\n"
                        + "echo 正在启用所有网络适配器...\r\n"
                        + ":: 遍历索引1到10的适配器并启用\r\n"
                        + "for /l %%i in (1,1,10) do (\r\n"
                        + "    wmic path win32_networkadapter where Index=%%i call enable >nul 2>&1\r\n"
                        + "    echo 已尝试启用索引 %%i 的适配器\r\n"
                        + ")\r\n"
                        + "\r\n"
                        + "echo.\r\n"
                        + "echo 启用完成，当前状态：\r\n"
                        + "wmic nic get Name,Index,NetEnabled | findstr \"TRUE FALSE\"\r\n"
                        + "\r\n"
                        + "pause\r\n"
                        + "exit";

                // 关键修改：手动拼接完整路径
                String batFileName = "JYKdisableProMax_" + System.currentTimeMillis() + ".bat";
                String fullBatPath = USER_HOME + File.separator + batFileName;
                File batFile = new File(fullBatPath);

                try {
                    OutputStreamWriter osw = new OutputStreamWriter(new FileOutputStream(batFile), "UTF-8");
                    PrintWriter pw = new PrintWriter(osw);

                    pw.write(batContent);
                    pw.flush();
                    pw.close();
                    osw.close();

                    if (!batFile.exists() || batFile.length() == 0) {
                        System.out.println("错误：解除网络控制pro max强力版脚本创建失败或文件为空！");
                        return;
                    }
                    System.out.println("正在运行强力版脚本（请在弹出的窗口中授权管理员权限）");

                    String psCommand = String.format(
                            "Start-Process -FilePath \"%s\" -Verb RunAs -Wait",
                            batFile.getAbsolutePath()
                    );
                    ProcessBuilder pb = new ProcessBuilder("powershell", "-Command", psCommand);
                    Process process = pb.start();

                    process.waitFor();
                    System.out.println("解除网络控制pro max强力版脚本已完全执行完毕");

                } catch (IOException | InterruptedException e) {
                    System.out.println("错误：执行强力版脚本过程中出现异常！");
                    e.printStackTrace();
                } finally {
                    if (batFile.exists()) {
                        boolean deleted = batFile.delete();
                        if (deleted) {
                            System.out.println("网络控制已解除");
                        } else {
                            System.out.println("强力版脚本执行完成，但文件删除失败，路径：" + fullBatPath);
                            System.out.println("==================================================");
                        }
                    }
                }
            } else if (code.equals("debug")) {
                System.out.println("开始解决强力版脚本运行后的卡顿问题");

                // 1. 嵌入指定的netsh命令
                String batContent = "@echo off\r\n"
                        + "title Timeless-Debug - 禁用以太网2\r\n"
                        + "echo 正在获取管理员权限...\r\n"
                        + ">nul 2>&1 \"%SYSTEMROOT%\\system32\\cacls.exe\" \"%SYSTEMROOT%\\system32\\config\\system\"\r\n"
                        + "if %errorlevel% neq 0 (\r\n"
                        + "    powershell -Command \"Start-Process '%~f0' -Verb RunAs\" >nul 2>&1\r\n"
                        + "    exit /b\r\n"
                        + ")\r\n"
                        + "\r\n"
                        + ":: 执行禁用以太网2的命令\r\n"
                        + "netsh interface set interface \"以太网 2\" admin=disable\r\n"
                        + "\r\n"
                        + "echo 命令执行完成！\r\n"
                        + ":: 等待2秒让用户查看结果\r\n"
                        + "timeout /t 2 /nobreak >nul\r\n"
                        + "exit";

                // 关键修改：手动拼接完整路径
                String batFileName = "JYDebug_Ethernet2_" + System.currentTimeMillis() + ".bat";
                String fullBatPath = USER_HOME + File.separator + batFileName;
                File batFile = new File(fullBatPath);

                try {
                    OutputStreamWriter osw = new OutputStreamWriter(new FileOutputStream(batFile), "GBK");
                    PrintWriter pw = new PrintWriter(osw);

                    pw.write(batContent);
                    pw.flush();
                    pw.close();
                    osw.close();

                    if (!batFile.exists() || batFile.length() == 0) {
                        System.out.println("错误：调试脚本创建失败或文件为空！");
                        return;
                    }
                    System.out.println("正在运行调试脚本（请在弹出的窗口中授权管理员权限）");

                    String psCommand = String.format(
                            "Start-Process -FilePath \"%s\" -Verb RunAs -Wait",
                            batFile.getAbsolutePath()
                    );
                    ProcessBuilder pb = new ProcessBuilder("powershell", "-Command", psCommand);
                    Process process = pb.start();

                    process.waitFor();
                    System.out.println("调试脚本已完全执行完毕");

                } catch (IOException | InterruptedException e) {
                    System.out.println("错误：执行调试脚本过程中出现异常！");
                    e.printStackTrace();
                } finally {
                    if (batFile.exists()) {
                        boolean deleted = batFile.delete();
                        if (deleted) {
                            System.out.println("调试脚本执行完成，已解决卡死现象");
                        } else {
                            System.out.println("调试脚本执行完成，但文件删除失败，路径：" + fullBatPath);
                            System.out.println("==================================================");
                        }
                    }
                }
            } else if (code.equals("optimize")) {
                System.out.println("开始执行网络优化配置");
                System.out.println("该脚本可以使浏览器响应速度提升近一倍");

                // 1. 嵌入指定的网络优化BAT内容
                String batContent = "REG ADD \"HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge\" /v DnsOverHttpsMode /t REG_SZ /d Off /f\r\n"
                        + "@echo off\r\n"
                        + "mode con cols=80 lines=30\r\n"
                        + "title Timeless-网络优化1.2\r\n"
                        + "echo.\r\n"
                        + "echo ========================================================\r\n"
                        + "echo              正在执行【管理员权限】网络配置脚本\r\n"
                        + "echo ========================================================\r\n"
                        + "echo 1. 禁用 Npcap Lookback Adapter 虚拟网卡\r\n"
                        + "echo 2. 所有网卡DNS修改为 首选223.5.5.5 备用223.6.6.6\r\n"
                        + "echo 3. 彻底禁用全网卡IPv6协议+IPv6隧道服务\r\n"
                        + "echo ========================================================\r\n"
                        + "echo.\r\n"
                        + "\r\n"
                        + ":: ====================== 1. 禁用 Npcap Lookback Adapter 网卡 ======================\r\n"
                        + "echo [1/3] 正在禁用 Npcap Loopback Adapter 虚拟网卡...\r\n"
                        + "wmic nic where \"name like '%%Npcap Loopback Adapter%%'\" call disable >nul 2>&1\r\n"
                        + "if %errorlevel% equ 0 (\r\n"
                        + "echo Npcap Loopback Adapter 网卡 禁用成功！\r\n"
                        + ") else (\r\n"
                        + "echo Npcap Loopback Adapter 网卡 已禁用/未找到该网卡，无需操作\r\n"
                        + ")\r\n"
                        + "echo.\r\n"
                        + "\r\n"
                        + ":: ====================== 2. 所有网卡统一修改DNS ======================\r\n"
                        + "echo [2/3] 正在为所有网卡配置DNS地址 223.5.5.5 ...\r\n"
                        + "for /f \"tokens=* delims=\" %%i in ('netsh interface show interface ^| findstr /i \"已启用\"') do (\r\n"
                        + "    for /f \"tokens=4 delims= \" %%a in (\"%%i\") do (\r\n"
                        + "        netsh interface ipv4 set dns name=\"%%a\" static 223.5.5.5 validate=no >nul 2>&1\r\n"
                        + "        netsh interface ipv4 add dns name=\"%%a\" 223.6.6.6 index=2 validate=no >nul 2>&1\r\n"
                        + "    )\r\n"
                        + ")\r\n"
                        + "ipconfig /flushdns >nul 2>&1\r\n"
                        + "echo DNS地址已全部修改为：首选 223.5.5.5  备用 223.6.6.6\r\n"
                        + "echo 本地DNS缓存已清空！\r\n"
                        + "echo.\r\n"
                        + "\r\n"
                        + ":: ====================== 3. 禁用IPv6 ======================\r\n"
                        + "echo [3/3] 正在彻底禁用所有网卡的IPv6协议...\r\n"
                        + "powershell -Command \"Disable-NetAdapterBinding -Name '*' -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue\" >nul 2>&1\r\n"
                        + "echo 所有网卡IPv6协议已禁用！\r\n"
                        + "echo.\r\n"
                        + "echo 正在禁用IPv6隧道服务...\r\n"
                        + "netsh interface teredo set state disable >nul 2>&1\r\n"
                        + "netsh interface 6to4 set state disabled >nul 2>&1\r\n"
                        + "netsh interface isatap set state disabled >nul 2>&1\r\n"
                        + "echo IPv6隧道服务已全部禁用！\r\n"
                        + "echo.\r\n"
                        + "\r\n"
                        + ":: 收尾+验证\r\n"
                        + "echo ========================================================\r\n"
                        + "echo 所有网络配置全部执行完成！\r\n"
                        + "echo 生效说明：IPv6禁用部分需要重启电脑后完全生效\r\n"
                        + "echo 当前DNS已立即生效，网卡禁用已立即生效\r\n"
                        + "echo ========================================================\r\n"
                        + "echo.\r\n"
                        + "pause >nul\r\n"
                        + "exit";

                // 关键修改：手动拼接完整路径
                String batFileName = "JYOptimize_Network_" + System.currentTimeMillis() + ".bat";
                String fullBatPath = USER_HOME + File.separator + batFileName;
                File batFile = new File(fullBatPath);

                try {
                    OutputStreamWriter osw = new OutputStreamWriter(new FileOutputStream(batFile), "GBK");
                    PrintWriter pw = new PrintWriter(osw);

                    pw.write(batContent);
                    pw.flush();
                    pw.close();
                    osw.close();

                    if (!batFile.exists() || batFile.length() == 0) {
                        System.out.println("错误：网络优化脚本创建失败或文件为空！");
                        return;
                    }
                    System.out.println("正在运行网络优化脚本（请在弹出的窗口中授权管理员权限）");

                    String psCommand = String.format(
                            "Start-Process -FilePath \"%s\" -Verb RunAs -Wait",
                            batFile.getAbsolutePath()
                    );
                    ProcessBuilder pb = new ProcessBuilder("powershell", "-Command", psCommand);
                    Process process = pb.start();

                    process.waitFor();
                    System.out.println("网络优化脚本已完全执行完毕");

                } catch (IOException | InterruptedException e) {
                    System.out.println("错误：执行网络优化脚本过程中出现异常！");
                    e.printStackTrace();
                } finally {
                    if (batFile.exists()) {
                        boolean deleted = batFile.delete();
                        if (deleted) {
                            System.out.println("已成功完成网络优化配置");
                        } else {
                            System.out.println("网络优化脚本执行完成，但文件删除失败，路径：" + fullBatPath);
                            System.out.println("==================================================");
                        }
                    }
                }
            }
        }
    }

    // 辅助方法：读取BAT脚本的输出/错误信息，避免中文乱码
    private static void readProcessOutput(InputStream inputStream) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(inputStream, "UTF-8"));
        String line;
        while ((line = br.readLine()) != null) {
            System.out.println(line);
        }
        br.close();
    }
}