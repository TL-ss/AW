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
    // 全局变量：用户主目录路径
    private static final String USER_HOME = System.getProperty("user.home");

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        System.out.println("==================================================");
        System.out.println("             ╭───╮ ╭───╮ ╭───╮ ╭───╮");
        System.out.println("             │ J │ │ Y │ │ K │ │ T │");
        System.out.println("             ╰───╯ ╰───╯ ╰───╯ ╰───╯");
        System.out.println("             集成化极域破解工具V 2.1.0");
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
            System.out.print(">");
            String code = scanner.next();
            if (code.equals("help")) {
                System.out.println("1           极域破解模块");
                System.out.println("2           惠普机房运维管理系统破解模块");
                System.out.println("exit        退出程序");
            } else if (code.equals("1")) {
                System.out.println("极域破解");
                jiyuModule(scanner);
            } else if (code.equals("2")) {
                System.out.println("惠普机房运维管理系统破解");
                hpModule(scanner);
            } else if (code.equals("exit")) {
                System.out.println("确定退出程序？(Y/N)");
                String c = scanner.next();
                if (c.equalsIgnoreCase("Y")) {
                    System.out.println("程序退出");
                    break;
                }
            } else {
                System.out.println(code + "不是有效的命令，请输入help查看");
            }
        }
        scanner.close();
    }

    // 极域破解模块
    private static void jiyuModule(Scanner scanner) {
        while (true) {
            System.out.print("jiyupj>>");
            String jy = scanner.next();
            if (jy.equals("help")) {
                System.out.println("==================================================");
                System.out.println("                    H E L P");
                System.out.println("                     帮助");
                System.out.println("                  （极域课堂）");
                System.out.println("                ↓ ↓ ↓ ↓ ↓ ↓ ↓ ↓");
                System.out.println("1             启动极域破解工具(JiYuTrainer)");
                System.out.println("stop          脱离教师控制");
                System.out.println("disable       解除网络控制");
                System.out.println("Kdisable      解除网络控制pro max强力版");
                System.out.println("debug         解决运行“解除网络控制pro max强力版”后电脑可能会产生的卡顿现象");
                System.out.println("optimize      网络优化");
                System.out.println("passwd        破解极域密码（测试版）");
                System.out.println("exit          退出");
                System.out.println("==================================================");
            } else if (jy.equals("1")) {
                System.out.println("正在启动 JiYuTrainer...");
                String batContent = "@echo off\r\n"
                        + "chcp 65001 >nul\r\n"
                        + "fltmc >nul 2>&1 || (powershell -Command \"Start-Process -FilePath '%~f0' -Verb RunAs\" >nul 2>&1 & exit /b)\r\n"
                        + "\r\n"
                        + "cd C:\\Program Files\\JYKILLTOOL\\jre\\jiy\r\n"
                        + "start JiYuTrainer.exe\r\n"
                        + "exit\r\n";
                String batFileName = "JY_Trainer_" + System.currentTimeMillis() + ".bat";
                File batFile = new File(USER_HOME, batFileName);
                try {
                    writeBat(batFile, batContent, "UTF-8");
                    runBatAsAdmin(batFile);
                    System.out.println("已启动 JiYuTrainer");
                } catch (Exception e) {
                    System.out.println("启动失败！");
                    e.printStackTrace();
                } finally {
                    deleteFile(batFile);
                }
            } else if (jy.equals("passwd")) {
                System.out.println("正在破解中...");
                try { Thread.sleep(3000); } catch (InterruptedException ignored) {}
                String regPath = "HKEY_LOCAL_MACHINE\\SOFTWARE\\TopDomain\\e-learning Class Standard\\1.00";
                String regItem = "UninstallPasswd";
                String resultData = null;
                try {
                    String[] cmd = {"reg", "query", regPath, "/v", regItem, "/reg:64"};
                    Process process = new ProcessBuilder(cmd).start();
                    BufferedReader reader = new BufferedReader(new InputStreamReader(process.getInputStream(), "GBK"));
                    String line;
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
                    if (resultData != null) {
                        if (resultData.length() > 6) {
                            System.out.println("UninstallPasswd忽略前6位结果:" + resultData.substring(6));
                        } else {
                            System.out.println("提示:数据长度≤6位,无有效内容");
                        }
                    } else {
                        System.out.println("错误:未查询到UninstallPasswd项");
                    }
                    reader.close();
                    process.waitFor();
                } catch (Exception e) {
                    System.err.println("查询注册表失败");
                    e.printStackTrace();
                }
            } else if (jy.equals("stop")) {
                System.out.println("开始脱离教师机");
                String batContent = "@echo off\r\n"
                        + "chcp 65001 >nul\r\n"
                        + "setlocal enabledelayedexpansion\r\n"
                        + "\r\n"
                        + "echo ==============================\r\n"
                        + "echo 正在禁用所有网络适配器...\r\n"
                        + "echo ==============================\r\n"
                        + "for /l %%i in (1,1,10) do (\r\n"
                        + "    wmic path win32_networkadapter where Index=%%i call disable >nul 2>&1\r\n"
                        + "    echo 已尝试禁用索引 %%i 的适配器\r\n"
                        + ")\r\n"
                        + "\r\n"
                        + "echo 禁用完成\r\n"
                        + "timeout /t 3 /nobreak >nul\r\n"
                        + "\r\n"
                        + "echo 正在启用所有网络适配器...\r\n"
                        + "for /l %%i in (1,1,10) do (\r\n"
                        + "    wmic path win32_networkadapter where Index=%%i call enable >nul 2>&1\r\n"
                        + "    echo 已尝试启用索引 %%i 的适配器\r\n"
                        + ")\r\n"
                        + "exit";
                File batFile = new File(USER_HOME, "JYStopProcess_" + System.currentTimeMillis() + ".bat");
                try {
                    writeBat(batFile, batContent, "UTF-8");
                    runBatAsAdmin(batFile);
                    System.out.println("已脱离教师控制");
                } catch (Exception e) {
                    System.out.println("执行失败");
                    e.printStackTrace();
                } finally {
                    deleteFile(batFile);
                }
            } else if (jy.equals("disable")) {
                System.out.println("开始解除网络控制");
                String batContent = "title Timeless-进程阻断1.1\r\n"
                        + "@echo off\r\n"
                        + "echo 正在获取管理员权限...\r\n"
                        + ">nul 2>&1 \"%SYSTEMROOT%\\system32\\cacls.exe\" \"%SYSTEMROOT%\\system32\\config\\system\"\r\n"
                        + "if %errorlevel% neq 0 (\r\n"
                        + "    powershell -Command \"Start-Process '%~f0' -Verb RunAs\" >nul 2>&1\r\n"
                        + "    exit /b\r\n"
                        + ")\r\n"
                        + "taskkill /f /im MasterHelper.exe\r\n"
                        + "sc stop tdnetfilter\r\n"
                        + "echo 完成\r\n"
                        + "timeout /t 3 /nobreak >nul\r\n"
                        + "exit";
                File batFile = new File(USER_HOME, "JYDisableProcess_" + System.currentTimeMillis() + ".bat");
                try {
                    writeBat(batFile, batContent, "GBK");
                    runBatAsAdmin(batFile);
                    System.out.println("已成功解除网络控制");
                } catch (Exception e) {
                    System.out.println("执行失败");
                    e.printStackTrace();
                } finally {
                    deleteFile(batFile);
                }
            } else if (jy.equals("Kdisable")) {
                System.out.println("此操作会与老师断开连接,5秒后执行...");
                try { Thread.sleep(5000); } catch (InterruptedException ignored) {}
                System.out.println("开始运行强力版");
                String batContent = "title Timeless-Disable Ethernet Restrictions version1.0\r\n"
                        + "@echo off\r\n"
                        + "fltmc >nul 2>&1 || (powershell -Command \"Start-Process '%~f0' -Verb RunAs\" >nul 2>&1 & exit /b)\r\n"
                        + "taskkill /f /im MasterHelper.exe\r\n"
                        + "sc stop tdnetfilter\r\n"
                        + "for /l %%i in (1,1,10) do (\r\n"
                        + "    wmic path win32_networkadapter where Index=%%i call disable >nul 2>&1\r\n"
                        + ")\r\n"
                        + "timeout /t 3 /nobreak >nul\r\n"
                        + "for /l %%i in (1,1,10) do (\r\n"
                        + "    wmic path win32_networkadapter where Index=%%i call enable >nul 2>&1\r\n"
                        + ")\r\n"
                        + "exit";
                File batFile = new File(USER_HOME, "JYKdisableProMax_" + System.currentTimeMillis() + ".bat");
                try {
                    writeBat(batFile, batContent, "UTF-8");
                    runBatAsAdmin(batFile);
                    System.out.println("网络控制已解除");
                } catch (Exception e) {
                    System.out.println("执行失败");
                    e.printStackTrace();
                } finally {
                    deleteFile(batFile);
                }
            } else if (jy.equals("debug")) {
                System.out.println("开始解决卡顿问题");
                String batContent = "@echo off\r\n"
                        + "fltmc >nul 2>&1 || (powershell -Command \"Start-Process '%~f0' -Verb RunAs\" >nul 2>&1 & exit /b)\r\n"
                        + "netsh interface set interface \"以太网 2\" admin=disable\r\n"
                        + "echo 命令执行完成！\r\n"
                        + "timeout /t 2 /nobreak >nul\r\n"
                        + "exit";
                File batFile = new File(USER_HOME, "JYDebug_Ethernet2_" + System.currentTimeMillis() + ".bat");
                try {
                    writeBat(batFile, batContent, "GBK");
                    runBatAsAdmin(batFile);
                    System.out.println("已解决卡死现象");
                } catch (Exception e) {
                    System.out.println("执行失败");
                    e.printStackTrace();
                } finally {
                    deleteFile(batFile);
                }
            } else if (jy.equals("optimize")) {
                System.out.println("开始执行网络优化配置");
                String batContent = "@echo off\r\n"
                        + "REG ADD \"HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge\" /v DnsOverHttpsMode /t REG_SZ /d Off /f\r\n"
                        + "wmic nic where \"name like '%%Npcap Loopback Adapter%%'\" call disable >nul 2>&1\r\n"
                        + "for /f \"tokens=* delims=\" %%i in ('netsh interface show interface ^| findstr /i \"已启用\"') do (\r\n"
                        + "    for /f \"tokens=4 delims= \" %%a in (\"%%i\") do (\r\n"
                        + "        netsh interface ipv4 set dns name=\"%%a\" static 223.5.5.5 validate=no >nul 2>&1\r\n"
                        + "        netsh interface ipv4 add dns name=\"%%a\" 223.6.6.6 index=2 validate=no >nul 2>&1\r\n"
                        + "    )\r\n"
                        + ")\r\n"
                        + "ipconfig /flushdns >nul 2>&1\r\n"
                        + "powershell -Command \"Disable-NetAdapterBinding -Name '*' -ComponentID ms_tcpip6 -ErrorAction SilentlyContinue\" >nul 2>&1\r\n"
                        + "netsh interface teredo set state disable >nul 2>&1\r\n"
                        + "netsh interface 6to4 set state disabled >nul 2>&1\r\n"
                        + "netsh interface isatap set state disabled >nul 2>&1\r\n"
                        + "echo 优化完成\r\n"
                        + "exit";
                File batFile = new File(USER_HOME, "JYOptimize_Network_" + System.currentTimeMillis() + ".bat");
                try {
                    writeBat(batFile, batContent, "GBK");
                    runBatAsAdmin(batFile);
                    System.out.println("已成功完成网络优化配置");
                } catch (Exception e) {
                    System.out.println("执行失败");
                    e.printStackTrace();
                } finally {
                    deleteFile(batFile);
                }
            } else if (jy.equals("exit")) {
                System.out.println("确定要退出极域模块？(Y/N)");
                String exit = scanner.next();
                if (exit.equalsIgnoreCase("Y")) {
                    System.out.println("已退出极域模块");
                    break;
                }
            } else {
                System.out.println(jy + "不是有效的命令");
            }
        }
    }

    // 惠普破解模块
    private static void hpModule(Scanner scanner) {
        while (true) {
            System.out.print("HPpj>>");
            String hp = scanner.next();
            if (hp.equals("help")) {
                System.out.println("==================================================");
                System.out.println("                    H E L P");
                System.out.println("                     帮助");
                System.out.println("              （惠普机房运维管理系统）");
                System.out.println("hpkill        强制关闭惠普机房运维管理系统");
                System.out.println("hpstart       恢复惠普机房运维管理系统");
                System.out.println("vidkill       仅禁止教师机投屏/霸屏");
                System.out.println("vidrestart    恢复教师机投屏/霸屏");
                System.out.println("exit          退出");
                System.out.println("==================================================");
            } else if (hp.equals("vidrestart")) {
                System.out.println("正在恢复霸屏进程...");
                String batContent = "@echo off\r\n"
                        + "chcp 65001 >nul\r\n"
                        + "fltmc >nul 2>&1 || (powershell -Command \"Start-Process -FilePath '%~f0' -Verb RunAs\" >nul 2>&1 & exit /b)\r\n"
                        + "cd C:\\Program Files (x86)\\HP\\LabManager Ultimate\\Client\\eclass\\vidrecv\\\r\n"
                        + "ren videorecv.txt videorecv.exe >nul 2>&1\r\n"
                        + "start videorecv.exe >nul 2>&1\r\n"
                        + "echo 操作完成！\r\n"
                        + "exit";
                File batFile = new File(USER_HOME, "JYStarvid_" + System.currentTimeMillis() + ".bat");
                try {
                    writeBat(batFile, batContent, "UTF-8");
                    runBatAsAdmin(batFile);
                    System.out.println("视频监控进程已恢复完成");
                } catch (Exception e) {
                    System.out.println("执行失败！");
                    e.printStackTrace();
                } finally {
                    deleteFile(batFile);
                }
            } else if (hp.equals("hpkill")) {
                System.out.println("开始强制关闭惠普服务");
                String batContent = "@echo off\r\n"
                        + "chcp 65001 >nul\r\n"
                        + "fltmc >nul 2>&1 || (powershell -Command \"Start-Process -FilePath '%~f0' -Verb RunAs\" >nul 2>&1 & exit /b)\r\n"
                        + "sc stop HotkeyServiceDSU\r\n"
                        + "sc stop \"HP Comm Recover\"\r\n"
                        + "sc stop hp-one-agent-service\r\n"
                        + "taskkill /f /im HotkeyServiceDSU.exe\r\n"
                        + "taskkill /f /im hp-one-agent-service.exe\r\n"
                        + "taskkill /f /im iClient.exe\r\n"
                        + "taskkill /f /im capclient_c.exe\r\n"
                        + "echo 执行完成！\r\n"
                        + "exit";
                File batFile = new File(USER_HOME, "JYHPstop_" + System.currentTimeMillis() + ".bat");
                try {
                    writeBat(batFile, batContent, "UTF-8");
                    runBatAsAdmin(batFile);
                    System.out.println("已完成强制关闭惠普服务");
                } catch (Exception e) {
                    System.out.println("执行失败！");
                    e.printStackTrace();
                } finally {
                    deleteFile(batFile);
                }
            } else if (hp.equals("hpstart")) {
                System.out.println("开始恢复惠普服务");
                String batContent = "@echo off\r\n"
                        + "chcp 65001 >nul\r\n"
                        + "fltmc >nul 2>&1 || (powershell -Command \"Start-Process -FilePath '%~f0' -Verb RunAs\" >nul 2>&1 & exit /b)\r\n"
                        + "cd C:\\Program Files (x86)\\HP\\LabManager Ultimate\\Client\\cap\r\n"
                        + "start capclient_c.exe\r\n"
                        + "cd C:\\Program Files (x86)\\HP\\LabManager Ultimate\\Client\r\n"
                        + "start iClient.exe\r\n"
                        + "sc start HotkeyServiceDSU\r\n"
                        + "sc start \"HP Comm Recover\"\r\n"
                        + "sc start hp-one-agent-service\r\n"
                        + "echo 所有服务已恢复！\r\n"
                        + "exit";
                File batFile = new File(USER_HOME, "JYHPstart_" + System.currentTimeMillis() + ".bat");
                try {
                    writeBat(batFile, batContent, "UTF-8");
                    runBatAsAdmin(batFile);
                    System.out.println("已完成恢复惠普服务");
                } catch (Exception e) {
                    System.out.println("执行失败！");
                    e.printStackTrace();
                } finally {
                    deleteFile(batFile);
                }
            } else if (hp.equals("vidkill")) {
                System.out.println("正在禁止霸屏");
                String batContent = "@echo off\r\n"
                        + "chcp 65001 >nul\r\n"
                        + "fltmc >nul 2>&1 || (powershell -Command \"Start-Process -FilePath '%~f0' -Verb RunAs\" >nul 2>&1 & exit /b)\r\n"
                        + "taskkill /f /im videorecv.exe >nul 2>&1\r\n"
                        + "cd C:\\Program Files (x86)\\HP\\LabManager Ultimate\\Client\\eclass\\vidrecv\\\r\n"
                        + "ren videorecv.exe videorecv.txt >nul 2>&1\r\n"
                        + "echo 操作完成！\r\n"
                        + "exit";
                File batFile = new File(USER_HOME, "JYvidk_" + System.currentTimeMillis() + ".bat");
                try {
                    writeBat(batFile, batContent, "UTF-8");
                    runBatAsAdmin(batFile);
                    System.out.println("视频监控进程已禁用完成");
                } catch (Exception e) {
                    System.out.println("执行失败！");
                    e.printStackTrace();
                } finally {
                    deleteFile(batFile);
                }
            } else if (hp.equals("exit")) {
                System.out.println("确定要退出惠普模块？(Y/N)");
                String exit = scanner.next();
                if (exit.equalsIgnoreCase("Y")) {
                    System.out.println("已退出惠普模块");
                    break;
                }
            } else {
                System.out.println(hp + "不是有效的命令");
            }
        }
    }

    // 写入BAT文件
    private static void writeBat(File file, String content, String charset) throws IOException {
        OutputStreamWriter osw = new OutputStreamWriter(new FileOutputStream(file), charset);
        PrintWriter pw = new PrintWriter(osw);
        pw.write(content);
        pw.flush();
        pw.close();
        osw.close();
    }

    // 管理员运行BAT
    private static void runBatAsAdmin(File batFile) throws IOException, InterruptedException {
        String psCommand = String.format("Start-Process -FilePath \"%s\" -Verb RunAs -Wait", batFile.getAbsolutePath());
        ProcessBuilder pb = new ProcessBuilder("powershell", "-Command", psCommand);
        Process process = pb.start();
        process.waitFor();
    }

    // 删除文件
    private static void deleteFile(File file) {
        if (file.exists()) file.delete();
    }

    // 读取进程输出
    private static void readProcessOutput(InputStream inputStream) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(inputStream, "UTF-8"));
        String line;
        while ((line = br.readLine()) != null) {
            System.out.println(line);
        }
        br.close();
    }
}