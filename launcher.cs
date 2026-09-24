using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

class Program
{
    static void Main(string[] args)
    {
        string projectDir = @"d:\PROJETOS\agentc";
        
        // Se o executavel estiver em uma pasta que contenha package.json, usa ela
        string currentDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
        if (File.Exists(Path.Combine(currentDir, "package.json")))
        {
            projectDir = currentDir;
        }

        Console.Title = "AgentC - Console de Execucao";
        Console.WriteLine("=================================================");
        Console.WriteLine("              INICIANDO O AGENTC                 ");
        Console.WriteLine("=================================================");
        Console.WriteLine("Diretorio: " + projectDir);
        Console.WriteLine("Iniciando backend e frontend...");
        Console.WriteLine("Abrindo navegador em http://localhost:5173 ...");
        Console.WriteLine("Pressione Ctrl+C para encerrar.");
        Console.WriteLine("=================================================\n");

        // Abre o navegador apos 3 segundos em thread separada
        new Thread(() =>
        {
            Thread.Sleep(3000);
            try
            {
                Process.Start(new ProcessStartInfo("http://localhost:5173") { UseShellExecute = true });
            }
            catch { }
        }).Start();

        // Dispara o npm run dev
        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = "cmd.exe";
        psi.Arguments = "/c npm run dev";
        psi.WorkingDirectory = projectDir;
        psi.UseShellExecute = false;

        try
        {
            Process p = Process.Start(psi);
            p.WaitForExit();
        }
        catch (Exception ex)
        {
            Console.WriteLine("Erro ao iniciar o AgentC: " + ex.Message);
            Console.WriteLine("Pressione ENTER para fechar...");
            Console.ReadLine();
        }
    }
}
