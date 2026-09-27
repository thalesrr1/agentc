using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.ServiceProcess;
using System.Text;
using System.Threading;

public class AgentCService : ServiceBase
{
    public const string ServiceNameValue = "AgentC";
    private Process _process;
    private StreamWriter _logWriter;
    private readonly object _logLock = new object();
    private string _projectDir;

    public AgentCService()
    {
        this.ServiceName = ServiceNameValue;
        this.CanStop = true;
        this.CanShutdown = true;
    }

    private string ReadConfigValue(string configPath, string key)
    {
        if (!File.Exists(configPath)) return null;
        string[] lines = File.ReadAllLines(configPath);
        foreach (string line in lines)
        {
            int colon = line.IndexOf(':');
            if (colon > 0)
            {
                string k = line.Substring(0, colon).Trim(' ', '\t', '"', ',');
                if (string.Equals(k, key, StringComparison.OrdinalIgnoreCase))
                {
                    return line.Substring(colon + 1).Trim(' ', '\t', '"', ',', '\r', '\n').Replace("\\\\", "\\");
                }
            }
        }
        return null;
    }

    protected override void OnStart(string[] args)
    {
        try
        {
            string serviceDir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            string configPath = Path.Combine(serviceDir, "service.config.json");

            // Determina o diretório raiz do projeto
            _projectDir = ReadConfigValue(configPath, "projectDir");
            if (string.IsNullOrEmpty(_projectDir) || !Directory.Exists(_projectDir))
            {
                if (File.Exists(Path.Combine(serviceDir, "package.json")))
                {
                    _projectDir = serviceDir;
                }
                else
                {
                    _projectDir = Path.GetFullPath(Path.Combine(serviceDir, ".."));
                }
            }

            string logsDir = Path.Combine(_projectDir, "logs");
            if (!Directory.Exists(logsDir))
            {
                Directory.CreateDirectory(logsDir);
            }

            string logPath = Path.Combine(logsDir, "agentc-service.log");
            _logWriter = new StreamWriter(new FileStream(logPath, FileMode.Append, FileAccess.Write, FileShare.ReadWrite), Encoding.UTF8)
            {
                AutoFlush = true
            };

            Log("==================================================================");
            Log("Serviço AgentC iniciando...");
            Log("Diretório do serviço: " + serviceDir);
            Log("Diretório de trabalho do projeto: " + _projectDir);

            string userProfile = ReadConfigValue(configPath, "userProfile");
            if (string.IsNullOrEmpty(userProfile))
            {
                userProfile = Environment.GetEnvironmentVariable("USERPROFILE");
            }
            Log("Perfil de usuário vinculado: " + userProfile);

            string npmPath = ReadConfigValue(configPath, "npmPath");
            if (string.IsNullOrEmpty(npmPath) || !File.Exists(npmPath))
            {
                npmPath = FindNpmPath();
            }
            Log("Caminho do NPM: " + npmPath);

            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "cmd.exe";
            psi.Arguments = string.Format("/c \"\"{0}\" run dev\"", npmPath);
            psi.WorkingDirectory = _projectDir;
            psi.UseShellExecute = false;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.CreateNoWindow = true;

            // Injeta variáveis de ambiente para manter acesso à base SQLite e ferramentas do usuário
            if (!string.IsNullOrEmpty(userProfile))
            {
                psi.EnvironmentVariables["USERPROFILE"] = userProfile;
                psi.EnvironmentVariables["HOME"] = userProfile;
                psi.EnvironmentVariables["HOMEPATH"] = userProfile;
                psi.EnvironmentVariables["APPDATA"] = Path.Combine(userProfile, "AppData\\Roaming");
                psi.EnvironmentVariables["LOCALAPPDATA"] = Path.Combine(userProfile, "AppData\\Local");
                psi.EnvironmentVariables["AGENTC_DB_PATH"] = Path.Combine(userProfile, ".agentc\\agentc.db");
            }

            // Garante que o diretório do Node esteja no PATH
            string currentPath = Environment.GetEnvironmentVariable("PATH") ?? "";
            string nodeDir = Path.GetDirectoryName(npmPath);
            if (!string.IsNullOrEmpty(nodeDir) && !currentPath.Contains(nodeDir))
            {
                psi.EnvironmentVariables["PATH"] = nodeDir + ";" + currentPath;
            }

            _process = new Process();
            _process.StartInfo = psi;
            _process.OutputDataReceived += (s, e) => { if (e.Data != null) Log("[OUT] " + e.Data); };
            _process.ErrorDataReceived += (s, e) => { if (e.Data != null) Log("[ERR] " + e.Data); };

            _process.Start();
            _process.BeginOutputReadLine();
            _process.BeginErrorReadLine();

            Log(string.Format("Processo filho iniciado com PID {0}", _process.Id));
        }
        catch (Exception ex)
        {
            Log("ERRO fatal ao iniciar serviço: " + ex.ToString());
            throw;
        }
    }

    protected override void OnStop()
    {
        Log("Recebido comando de parada do serviço...");
        KillProcessTree();
        Log("Serviço AgentC parado.");
        if (_logWriter != null)
        {
            try { _logWriter.Flush(); _logWriter.Dispose(); } catch { }
        }
    }

    protected override void OnShutdown()
    {
        OnStop();
    }

    private void KillProcessTree()
    {
        if (_process != null)
        {
            try
            {
                if (!_process.HasExited)
                {
                    int pid = _process.Id;
                    Log(string.Format("Encerrando árvore de processos (PID {0})...", pid));
                    ProcessStartInfo psi = new ProcessStartInfo("taskkill.exe", string.Format("/F /T /PID {0}", pid));
                    psi.CreateNoWindow = true;
                    psi.UseShellExecute = false;
                    Process p = Process.Start(psi);
                    p.WaitForExit(7000);
                    Log("Processos filhos encerrados com sucesso.");
                }
            }
            catch (Exception ex)
            {
                Log("Aviso ao encerrar processos: " + ex.Message);
            }
        }
    }

    private string FindNpmPath()
    {
        string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        string[] paths = pathEnv.Split(';');
        foreach (string p in paths)
        {
            try
            {
                string candidate = Path.Combine(p.Trim(), "npm.cmd");
                if (File.Exists(candidate)) return candidate;
            }
            catch { }
        }

        string[] defaults = new string[]
        {
            @"C:\Program Files\nodejs\npm.cmd",
            @"C:\Program Files (x86)\nodejs\npm.cmd"
        };

        foreach (string candidate in defaults)
        {
            if (File.Exists(candidate)) return candidate;
        }

        return "npm.cmd";
    }

    private void Log(string message)
    {
        lock (_logLock)
        {
            try
            {
                string line = string.Format("[{0:yyyy-MM-dd HH:mm:ss}] {1}", DateTime.Now, message);
                if (_logWriter != null)
                {
                    _logWriter.WriteLine(line);
                }
                if (Environment.UserInteractive)
                {
                    Console.WriteLine(line);
                }
            }
            catch { }
        }
    }

    static void Main(string[] args)
    {
        if (Environment.UserInteractive)
        {
            Console.WriteLine("AgentC Service - Modo de Teste Interativo");
            Console.WriteLine("Iniciando serviço localmente...");
            AgentCService service = new AgentCService();
            service.OnStart(args);
            Console.WriteLine("\nServiço iniciado! Pressione ENTER para interromper e encerrar...");
            Console.ReadLine();
            service.OnStop();
            Console.WriteLine("Serviço finalizado.");
        }
        else
        {
            ServiceBase.Run(new AgentCService());
        }
    }
}
