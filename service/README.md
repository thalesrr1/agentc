# AgentC — Gerenciamento do Serviço Windows

Esta pasta agrupa todos os scripts e utilitários para instalar, gerenciar e rodar o AgentC silenciosamente como um Serviço do Windows em segundo plano.

---

### Scripts Disponíveis

* **`instalar-servico.bat`**:
  * Solicita permissão de Administrador (UAC).
  * Compila `AgentCService.cs` nativamente pelo Windows (`csc.exe`).
  * Salva o perfil do usuário em `service.config.json` para manter acesso integral à base de dados SQLite (`~/.agentc/agentc.db`), Git e CLIs de IA.
  * Registra o serviço `AgentC` com inicialização **MANUAL** (`demand`).

* **`desinstalar-servico.bat`**:
  * Para o serviço caso esteja em execução.
  * Remove o serviço do registro do Windows (`sc delete AgentC`).

* **`abrir-agentc.bat`**:
  * **Facilitador**: checa se o serviço está ativo. Se estiver parado, sobe o serviço em segundo plano e abre `http://localhost:5173` no navegador padrão, fechando o prompt imediatamente sem manter terminal aberto.

* **`iniciar-servico.bat`**:
  * Inicia o serviço `AgentC` em segundo plano (útil para quem vai usar o PWA instalado diretamente).

* **`parar-servico.bat`**:
  * Interrompe o serviço e finaliza recursivamente todos os processos filhos (`node`, `vite`, `tsx`).

* **`status-servico.bat`**:
  * Exibe o status atual do serviço (`RUNNING`, `STOPPED`, tipo de inicialização).

---

### Inicialização Automática com o Windows (Opcional)

Por padrão, o serviço é configurado para inicialização **Manual**. Caso queira que ele inicie automaticamente ao ligar o computador:
* Abra o `services.msc`, localize **AgentC Service**, dê duplo clique e mude o *Tipo de Inicialização* para **Automático**; ou
* Execute no Prompt/PowerShell como Administrador:
  ```powershell
  sc.exe config AgentC start= auto
  ```
