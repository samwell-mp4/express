import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LayoutDashboard,
  Layers,
  GitMerge,
  FileText,
  Plug,
  Bell,
  Search,
  RefreshCw,
  Trash2,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Check,
  Send,
  Building,
  Smartphone,
  ExternalLink,
  Save,
  HelpCircle,
  ShieldAlert,
  Clock,
  X,
  ChevronRight,
  Filter,
  Plus
} from 'lucide-react';
import './MonitoramentoBMs.css';

interface MonitoramentoBMsProps {
  onSelectNumberForDispatch?: (number: string, bmName: string) => void;
  onSelectNumberForRegistry?: (number: string, bmName: string) => void;
}

export const MonitoramentoBMs: React.FC<MonitoramentoBMsProps> = ({
  onSelectNumberForDispatch,
  onSelectNumberForRegistry
}) => {
  const [subTab, setSubTab] = useState<'visao_geral' | 'operacao' | 'esteira' | 'templates' | 'conexoes' | 'alertas'>('visao_geral');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'todas' | 'agencia' | 'cliente'>('todas');

  const [conexoes, setConexoes] = useState<any[]>([]);
  const [aquecimentoConfig, setAquecimentoConfig] = useState<any[]>([]);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [resumoGeral, setResumoGeral] = useState({
    totalBms: 0,
    totalWabas: 0,
    totalNumeros: 0,
    totalNumerosQualidadeBaixa: 0,
    totalTemplates: 0,
    totalTemplatesRejeitados: 0,
    totalMsgs24hEnviadas: 0,
    totalMsgs24hEntregues: 0,
    totalWabasNotificadas: 0
  });

  // Formulário Conectar BM
  const [formNome, setFormNome] = useState('');
  const [formBmId, setFormBmId] = useState('');
  const [formToken, setFormToken] = useState('');
  const [formTipo, setFormTipo] = useState<'agencia' | 'cliente'>('agencia');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Metas do volume diário
  const [metas, setMetas] = useState<Record<string, number | string>>({});
  const [savingMeta, setSavingMeta] = useState<Record<string, boolean>>({});

  const [lastSyncText, setLastSyncText] = useState('nunca');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Atalho [Ctrl + K] para busca rápida
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Helper seguro para requisições JSON que nunca estoura SyntaxError
  const safeFetchJson = async (url: string, options?: RequestInit) => {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (_) {
        data = null;
      }
      return { ok: res.ok, status: res.status, data, error: null };
    } catch (err: any) {
      return { ok: false, status: 0, data: null, error: err.message || 'Falha de rede' };
    }
  };

  const carregarDados = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { ok, data } = await safeFetchJson('/api/bm/dados');
      if (ok && data && data.success) {
        setConexoes(data.conexoes || []);
        setAquecimentoConfig(data.aquecimentoConfig || []);
        setAlertas(data.alertas || []);
        if (data.resumoGeral) setResumoGeral(data.resumoGeral);

        const m: Record<string, number | string> = {};
        (data.aquecimentoConfig || []).forEach((c: any) => {
          m[c.etapa] = c.meta_diaria;
        });
        setMetas(m);

        const lastDate = data.conexoes?.[0]?.ultima_verificacao;
        if (lastDate) {
          const diffMin = Math.round((Date.now() - new Date(lastDate).getTime()) / 60000);
          setLastSyncText(diffMin <= 1 ? 'agora mesmo' : `há ${diffMin} min`);
        } else {
          setLastSyncText('nunca');
        }

        // Limpa cache falso legado se houver
        localStorage.removeItem('bm_conexoes_store');
      } else {
        setConexoes([]);
        setResumoGeral({
          totalBms: 0,
          totalWabas: 0,
          totalNumeros: 0,
          totalNumerosQualidadeBaixa: 0,
          totalTemplates: 0,
          totalTemplatesRejeitados: 0,
          totalMsgs24hEnviadas: 0,
          totalMsgs24hEntregues: 0,
          totalWabasNotificadas: 0
        });
        setLastSyncText('nunca');
      }
    } catch (err) {
      console.warn('[Painel BM] Erro ao carregar dados:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const { ok, data } = await safeFetchJson('/api/bm/sincronizar', { method: 'POST' });
      if (ok && data && data.success) {
        await carregarDados(false);
      }
    } catch (err) {
      console.error('Erro ao sincronizar com a Meta:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleConnectBm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formBmId || !formToken) {
      setFormMsg({ type: 'error', text: 'Preencha o ID da BM e o Token do usuário do sistema.' });
      return;
    }

    setFormSubmitting(true);
    setFormMsg(null);
    try {
      const { ok, data } = await safeFetchJson('/api/bm/conectar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: formNome,
          bm_id: formBmId,
          token: formToken,
          tipo: formTipo
        })
      });

      if (ok && data && data.success) {
        setFormMsg({
          type: 'success',
          text: data.message || `BM conectada com sucesso! ${data.totalNumeros || 0} número(s) e ${data.totalTemplates || 0} template(s) carregados da Meta.`
        });
        setFormNome('');
        setFormBmId('');
        setFormToken('');
        await carregarDados(false);
      } else {
        // Exibe erro real retornado pela Meta Graph API
        const errMsg = data?.error || 'Não foi possível validar com a Meta Graph API. Verifique se o ID e o Token do Usuário do Sistema estão corretos e possuem permissões ativas.';
        setFormMsg({ type: 'error', text: errMsg });
      }
    } catch (err: any) {
      setFormMsg({ type: 'error', text: err.message || 'Erro de rede ao conectar BM.' });
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteBm = async (id: number, nome: string) => {
    if (!window.confirm(`Tem certeza que deseja remover a conexão com "${nome}"?`)) return;
    try {
      await safeFetchJson(`/api/bm/conexoes/${id}`, { method: 'DELETE' });
      localStorage.removeItem('bm_conexoes_store');
      await carregarDados(false);
    } catch (err) {
      console.error('Erro ao deletar BM:', err);
    }
  };

  const handleSaveMeta = async (etapa: string) => {
    setSavingMeta(prev => ({ ...prev, [etapa]: true }));
    try {
      await safeFetchJson('/api/bm/aquecimento-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etapa,
          meta_diaria: Number(metas[etapa]) || 0
        })
      });
      await carregarDados(false);
    } catch (err) {
      console.error('Erro ao salvar meta:', err);
    } finally {
      setSavingMeta(prev => ({ ...prev, [etapa]: false }));
    }
  };

  const handleResolverAlerta = async (id: number) => {
    try {
      await safeFetchJson(`/api/bm/alertas/${id}/resolver`, { method: 'POST' });
      setAlertas(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error('Erro ao resolver alerta:', err);
    }
  };

  const conexoesFiltradas = useMemo(() => {
    return conexoes.filter(c => {
      if (filterType !== 'todas' && c.tipo !== filterType) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      const matchNome = (c.nome || '').toLowerCase().includes(s);
      const matchId = (c.bm_id || '').toLowerCase().includes(s);
      const matchWaba = (c.dados?.wabas || []).some((w: any) =>
        (w.name || '').toLowerCase().includes(s) ||
        (w.id || '').toLowerCase().includes(s) ||
        (w.numeros || []).some((n: any) =>
          (n.display_phone_number || '').includes(s) ||
          (n.verified_name || '').toLowerCase().includes(s)
        )
      );
      return matchNome || matchId || matchWaba;
    });
  }, [conexoes, filterType, search]);

  const countTodas = conexoes.length;
  const countAgencia = conexoes.filter(c => c.tipo === 'agencia').length;
  const countClientes = conexoes.filter(c => c.tipo === 'cliente').length;

  const todosNumeros = useMemo(() => {
    const list: any[] = [];
    conexoesFiltradas.forEach(c => {
      (c.dados?.wabas || []).forEach((w: any) => {
        (w.numeros || []).forEach((n: any) => {
          list.push({
            ...n,
            bmNome: c.nome,
            bmId: c.bm_id,
            wabaNome: w.name,
            wabaId: w.id,
            wabaNotificada: w.notificada,
            wabaStatus: w.status
          });
        });
      });
    });
    return list;
  }, [conexoesFiltradas]);

  const todosTemplates = useMemo(() => {
    const list: any[] = [];
    conexoesFiltradas.forEach(c => {
      (c.dados?.wabas || []).forEach((w: any) => {
        (w.templates || []).forEach((t: any) => {
          list.push({
            ...t,
            bmNome: c.nome,
            bmId: c.bm_id,
            wabaNome: w.name,
            wabaId: w.id
          });
        });
      });
    });
    return list;
  }, [conexoesFiltradas]);

  const funilStats = useMemo(() => {
    let bmsCount = conexoesFiltradas.length;
    let totalWabas = 0;
    let contasSemNumero = 0;
    let comNumero = 0;
    let jaDispararam = 0;

    conexoesFiltradas.forEach(c => {
      const wabas = c.dados?.wabas || [];
      totalWabas += wabas.length;
      const numTotal = c.dados?.totalNumeros || 0;
      const msgs = c.dados?.msgs24hEnviadas || 0;

      if (numTotal === 0) {
        contasSemNumero += 1;
      } else {
        comNumero += 1;
      }
      if (msgs > 0) {
        jaDispararam += 1;
      }
    });

    return {
      bmsCount,
      totalWabas,
      contasSemNumero,
      comNumero,
      jaDispararam: jaDispararam > 0 ? jaDispararam : '—'
    };
  }, [conexoesFiltradas]);

  return (
    <div className="pbm-wrapper">
      {/* =========================================================
         TOP HEADER BAR
         ========================================================= */}
      <div className="pbm-header-card">
        <div className="pbm-header-left">
          <div className="pbm-header-icon">
            <Layers size={18} strokeWidth={2.2} />
          </div>
          <div>
            <div className="pbm-header-badges">
              <span className="badge badge-approved">Meta Graph API</span>
              <span className="pbm-sync-tag">
                <Clock size={12} />
                Sincronizado: <strong>{lastSyncText}</strong>
              </span>
            </div>
            <h2 className="pbm-header-title">Painel de BMs &amp; Monitoramento</h2>
            <p className="pbm-header-desc">
              Monitoramento em tempo real da Meta Graph API: saúde dos chips, esteira de maturação, templates e contas WABA.
            </p>
          </div>
        </div>

        <div className="pbm-header-actions">
          {/* Campo de Busca Rápida */}
          <div className="pbm-search-wrap">
            <Search size={15} className="pbm-search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="pbm-search-input"
              placeholder="Buscar clientes, números, BMs... (Ctrl+K)"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="pbm-search-clear"
                title="Limpar busca"
                onClick={() => setSearch('')}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Botão Sincronizar com a Meta */}
          <button
            className={`btn-primary pbm-refresh-btn ${syncing ? 'syncing' : ''}`}
            title="Sincronizar dados agora com a Meta Graph API"
            onClick={handleSyncNow}
            disabled={syncing}
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            <span>{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
          </button>
        </div>
      </div>

      {/* =========================================================
         SUB-TABS BAR (HORIZONTAL MODERNA SAAS)
         ========================================================= */}
      <div className="pbm-nav-tabs">
        <button
          className={`pbm-nav-tab ${subTab === 'visao_geral' ? 'active' : ''}`}
          onClick={() => setSubTab('visao_geral')}
        >
          <LayoutDashboard size={15} />
          <span>Visão Geral</span>
        </button>

        <button
          className={`pbm-nav-tab ${subTab === 'operacao' ? 'active' : ''}`}
          onClick={() => setSubTab('operacao')}
        >
          <Smartphone size={15} />
          <span>Operação &amp; Chips</span>
          {resumoGeral.totalNumerosQualidadeBaixa > 0 ? (
            <span className="pbm-tab-badge danger">{resumoGeral.totalNumerosQualidadeBaixa}</span>
          ) : (
            todosNumeros.length > 0 && <span className="pbm-tab-badge neutral">{todosNumeros.length}</span>
          )}
        </button>

        <button
          className={`pbm-nav-tab ${subTab === 'esteira' ? 'active' : ''}`}
          onClick={() => setSubTab('esteira')}
        >
          <GitMerge size={15} />
          <span>Esteira de Aquecimento</span>
        </button>

        <button
          className={`pbm-nav-tab ${subTab === 'templates' ? 'active' : ''}`}
          onClick={() => setSubTab('templates')}
        >
          <FileText size={15} />
          <span>Templates Meta</span>
          {resumoGeral.totalTemplatesRejeitados > 0 ? (
            <span className="pbm-tab-badge danger">{resumoGeral.totalTemplatesRejeitados}</span>
          ) : (
            todosTemplates.length > 0 && <span className="pbm-tab-badge neutral">{todosTemplates.length}</span>
          )}
        </button>

        <button
          className={`pbm-nav-tab ${subTab === 'conexoes' ? 'active' : ''}`}
          onClick={() => setSubTab('conexoes')}
        >
          <Plug size={15} />
          <span>Conexões BMs</span>
          {conexoes.length > 0 && (
            <span className="pbm-tab-badge neutral">{conexoes.length}</span>
          )}
        </button>

        <button
          className={`pbm-nav-tab ${subTab === 'alertas' ? 'active' : ''}`}
          onClick={() => setSubTab('alertas')}
        >
          <Bell size={15} />
          <span>Alertas &amp; Risco</span>
          {alertas.length > 0 ? (
            <span className="pbm-tab-badge danger">{alertas.length}</span>
          ) : (
            <span className="pbm-tab-badge success">OK</span>
          )}
        </button>
      </div>

      {/* =========================================================
         CONTEÚDO DA SUB-TAB ATIVA
         ========================================================= */}
      <div className="pbm-content">
        {/* 1. VISÃO GERAL */}
        {subTab === 'visao_geral' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="pbm-page-header">
              <div className="pbm-page-tag">PAINEL EXECUTIVO</div>
              <h3 className="pbm-page-title">Visão Geral das BMs</h3>
              <p className="pbm-page-desc">Métricas consolidadas de mensagens 24h, saúde dos chips e capacidade de disparo.</p>
            </div>

            {/* BANNERS DE ALERTA RÁPIDO */}
            {resumoGeral.totalNumerosQualidadeBaixa > 0 && (
              <div className="pbm-alert-banner danger">
                <AlertTriangle size={18} />
                <div className="pbm-alert-text">
                  <h4>Atenção: {resumoGeral.totalNumerosQualidadeBaixa} número(s) com qualidade baixa detectados!</h4>
                  <p>Chips com rating Amarelo ou Vermelho correm risco de bloqueio se continuarem disparando em alta escala.</p>
                </div>
              </div>
            )}

            {resumoGeral.totalWabasNotificadas > 0 && (
              <div className="pbm-alert-banner warning">
                <AlertCircle size={18} />
                <div className="pbm-alert-text">
                  <h4>{resumoGeral.totalWabasNotificadas} conta(s) WABA com advertência ou restrição na Meta</h4>
                  <p>Verifique na aba de Operação ou Alertas os detalhes das restrições emitidas pela Meta.</p>
                </div>
              </div>
            )}

            {/* KPI CARDS (CLICÁVEIS) */}
            <div className="pbm-kpi-grid">
              <div
                className="pbm-kpi-card clickable"
                title="Clique para ir para Conexões"
                onClick={() => setSubTab('conexoes')}
              >
                <div className="pbm-kpi-label">
                  <span>BMs Conectadas</span>
                  <Building size={16} color="var(--primary-color)" />
                </div>
                <div className="pbm-kpi-value">{resumoGeral.totalBms}</div>
                <div className="pbm-kpi-sub">{resumoGeral.totalWabas} contas WABA vinculadas</div>
              </div>

              <div className="pbm-kpi-card">
                <div className="pbm-kpi-label">
                  <span>Mensagens 24h (Enviadas)</span>
                  <Send size={16} color="#0284c7" />
                </div>
                <div className="pbm-kpi-value">{resumoGeral.totalMsgs24hEnviadas.toLocaleString('pt-BR')}</div>
                <div className="pbm-kpi-sub">{resumoGeral.totalMsgs24hEntregues.toLocaleString('pt-BR')} entregues com sucesso</div>
              </div>

              <div
                className={`pbm-kpi-card clickable ${resumoGeral.totalNumerosQualidadeBaixa > 0 ? 'alert-danger' : ''}`}
                title="Clique para inspecionar os números em risco"
                onClick={() => setSubTab('operacao')}
              >
                <div className="pbm-kpi-label">
                  <span>Chips Qualidade Baixa</span>
                  <ShieldAlert size={16} color={resumoGeral.totalNumerosQualidadeBaixa > 0 ? '#dc2626' : '#16a34a'} />
                </div>
                <div className="pbm-kpi-value" style={{ color: resumoGeral.totalNumerosQualidadeBaixa > 0 ? '#dc2626' : '#16a34a' }}>
                  {resumoGeral.totalNumerosQualidadeBaixa}
                </div>
                <div className="pbm-kpi-sub">de {resumoGeral.totalNumeros} número(s) totais</div>
              </div>

              <div
                className="pbm-kpi-card clickable"
                title="Clique para ver os templates"
                onClick={() => setSubTab('templates')}
              >
                <div className="pbm-kpi-label">
                  <span>Templates de Mensagem</span>
                  <FileText size={16} color="#7c3aed" />
                </div>
                <div className="pbm-kpi-value">{resumoGeral.totalTemplates}</div>
                <div className="pbm-kpi-sub">
                  {resumoGeral.totalTemplatesRejeitados > 0 ? (
                    <span style={{ color: '#dc2626', fontWeight: 600 }}>{resumoGeral.totalTemplatesRejeitados} rejeitados pela Meta</span>
                  ) : (
                    'Todos aprovados'
                  )}
                </div>
              </div>
            </div>

            {/* BMs EM OPERAÇÃO */}
            <div className="pbm-card">
              <div className="pbm-card-header">
                <div>
                  <h3 className="pbm-card-title">Contas e BMs em Operação</h3>
                  <p className="pbm-card-sub">Resumo instantâneo do status das conexões ativas.</p>
                </div>
                {conexoes.length > 0 && (
                  <button
                    className="pbm-btn-save-sm"
                    onClick={() => setSubTab('conexoes')}
                  >
                    <Plus size={13} />
                    <span>Nova Conexão</span>
                  </button>
                )}
              </div>

              {conexoes.length === 0 ? (
                <div className="pbm-empty-box">
                  <div className="pbm-empty-icon">
                    <Plug size={32} />
                  </div>
                  <div className="pbm-empty-title">Nenhuma BM conectada</div>
                  <div className="pbm-empty-desc">
                    Conecte a BM da sua organização para começar a monitorar chips, qualidade e disparos em tempo real.
                  </div>
                  <button
                    className="pbm-btn-primary"
                    style={{ marginTop: '14px' }}
                    onClick={() => setSubTab('conexoes')}
                  >
                    <Plus size={14} />
                    <span>Conectar Primeira BM</span>
                  </button>
                </div>
              ) : (
                <div>
                  {conexoes.map(c => (
                    <div key={c.id} className="pbm-connection-card">
                      <div className="pbm-conn-info">
                        <div className="pbm-conn-name">
                          <span>{c.nome}</span>
                          <span className="pbm-badge green">Ativa</span>
                          {c.dados?.wabaNotificada && (
                            <span className="pbm-badge red">Notificada pela Meta</span>
                          )}
                        </div>
                        <div className="pbm-conn-meta">
                          <span><strong>ID BM:</strong> {c.bm_id}</span>
                          <span><strong>Contas WABA:</strong> {c.dados?.wabas?.length || 0}</span>
                          <span><strong>Números:</strong> {c.dados?.totalNumeros || 0}</span>
                          <span><strong>Msgs 24h:</strong> {(c.dados?.msgs24hEnviadas || 0).toLocaleString('pt-BR')}</span>
                          <span><strong>Qualidade baixa:</strong> {c.dados?.numerosQualidadeBaixa || 0}</span>
                        </div>
                      </div>

                      <div className="pbm-conn-actions">
                        <button
                          className="pbm-btn-save-sm"
                          onClick={() => setSubTab('operacao')}
                        >
                          Ver Números
                        </button>
                        <button
                          className="pbm-btn-save-sm"
                          onClick={() => setSubTab('conexoes')}
                        >
                          Gerenciar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 2. OPERAÇÃO (NÚMEROS & CHIPS) */}
        {subTab === 'operacao' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="pbm-page-header">
              <div className="pbm-page-tag">OPERAÇÃO DE NÚMEROS</div>
              <h3 className="pbm-page-title">Números Conectados &amp; Qualidade</h3>
              <p className="pbm-page-desc">Monitore qualidade (Verde/Amarelo/Vermelho), limites de envio e advertências de cada chip.</p>
            </div>

            {search && (
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Filter size={13} />
                <span>Filtrando por: <strong>"{search}"</strong> ({todosNumeros.length} encontrado(s))</span>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}
                  onClick={() => setSearch('')}
                >
                  Limpar filtro
                </button>
              </div>
            )}

            {todosNumeros.length === 0 ? (
              <div className="pbm-card">
                <div className="pbm-empty-box">
                  <div className="pbm-empty-icon">
                    <Smartphone size={32} />
                  </div>
                  <div className="pbm-empty-title">Nenhum número encontrado</div>
                  <div className="pbm-empty-desc">Conecte uma BM com contas WhatsApp ativas para carregar os números e status.</div>
                  <button
                    className="pbm-btn-primary"
                    style={{ marginTop: '14px' }}
                    onClick={() => setSubTab('conexoes')}
                  >
                    Ir para Conexões
                  </button>
                </div>
              </div>
            ) : (
              <div className="pbm-table-container">
                <table className="pbm-table">
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Nome Verificado</th>
                      <th>BM / WABA</th>
                      <th>Qualidade Meta</th>
                      <th>Capacidade (Tier)</th>
                      <th>Status WABA</th>
                      {(onSelectNumberForDispatch || onSelectNumberForRegistry) && <th style={{ textAlign: 'right' }}>Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {todosNumeros.map(n => (
                      <tr key={n.id}>
                        <td>
                          <strong>{n.display_phone_number || n.id}</strong>
                          {n.alerta && (
                            <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <AlertTriangle size={11} />
                              <span>{n.alerta}</span>
                            </div>
                          )}
                        </td>
                        <td>{n.verified_name || <span style={{ color: 'var(--text-dim)' }}>—</span>}</td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{n.bmNome}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{n.wabaNome || n.wabaId}</div>
                        </td>
                        <td>
                          <span className={`pbm-badge ${n.quality_rating === 'GREEN' ? 'green' : (n.quality_rating === 'YELLOW' ? 'yellow' : (n.quality_rating === 'RED' ? 'red' : 'neutral'))}`}>
                            {n.quality_rating === 'GREEN' ? (
                              <><Check size={11} /> Alta (Verde)</>
                            ) : n.quality_rating === 'YELLOW' ? (
                              <><AlertTriangle size={11} /> Média (Amarelo)</>
                            ) : n.quality_rating === 'RED' ? (
                              <><AlertCircle size={11} /> Baixa (Vermelho)</>
                            ) : (
                              n.quality_rating || 'Desconhecida'
                            )}
                          </span>
                        </td>
                        <td>
                          <span className="pbm-badge neutral">
                            {n.messaging_limit_tier?.replace('TIER_', '') || '250'} msgs/dia
                          </span>
                        </td>
                        <td>
                          {n.wabaNotificada ? (
                            <span className="pbm-badge red">Notificada</span>
                          ) : (
                            <span className="pbm-badge green">Normal</span>
                          )}
                        </td>
                        {(onSelectNumberForDispatch || onSelectNumberForRegistry) && (
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '6px' }}>
                              {onSelectNumberForDispatch && (
                                <button
                                  className="pbm-btn-save-sm"
                                  title="Usar esse número como remetente no Disparador"
                                  onClick={() => onSelectNumberForDispatch(n.display_phone_number || n.id, n.bmNome)}
                                >
                                  <Send size={12} />
                                  <span>Usar no Envio</span>
                                </button>
                              )}
                              {onSelectNumberForRegistry && (
                                <button
                                  className="pbm-btn-save-sm"
                                  title="Cadastrar nas WABAs salvas"
                                  onClick={() => onSelectNumberForRegistry(n.display_phone_number || n.id, n.bmNome)}
                                >
                                  Registrar
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 3. ESTEIRA DE AQUECIMENTO */}
        {subTab === 'esteira' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="pbm-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div className="pbm-page-tag">ESTEIRA DE AQUECIMENTO</div>
                <h3 className="pbm-page-title">Aquecimento de BMs</h3>
                <p className="pbm-page-desc">Cada BM avança de etapa conforme dados da Meta: número, limite, qualidade e disparos.</p>
              </div>

              <div className="pbm-filters-row" style={{ marginBottom: 0 }}>
                <button
                  className={`pbm-filter-pill ${filterType === 'todas' ? 'active' : ''}`}
                  onClick={() => setFilterType('todas')}
                >
                  Todas ({countTodas})
                </button>
                <button
                  className={`pbm-filter-pill ${filterType === 'agencia' ? 'active' : ''}`}
                  onClick={() => setFilterType('agencia')}
                >
                  Da agência ({countAgencia})
                </button>
                <button
                  className={`pbm-filter-pill ${filterType === 'cliente' ? 'active' : ''}`}
                  onClick={() => setFilterType('cliente')}
                >
                  Dos clientes ({countClientes})
                </button>
              </div>
            </div>

            {/* FUNIL VISUAL */}
            <div className="pbm-card">
              <div className="pbm-card-header">
                <div>
                  <h3 className="pbm-card-title">Funil de Maturação</h3>
                  <p className="pbm-card-sub">De BM criada até BM que já dispara em produção</p>
                </div>
              </div>

              <div className="pbm-funnel-grid">
                <div className="pbm-funnel-card">
                  <span className="pbm-funnel-step">Etapa 1</span>
                  <div className="pbm-funnel-label">BMs Conectadas</div>
                  <div className="pbm-funnel-value">{funilStats.bmsCount}</div>
                  <div className="pbm-funnel-sub">{funilStats.totalWabas} contas WhatsApp</div>
                </div>

                <div className="pbm-funnel-card">
                  <span className="pbm-funnel-step">Etapa 2</span>
                  <div className="pbm-funnel-label">Sem Número</div>
                  <div className="pbm-funnel-value">{funilStats.contasSemNumero}</div>
                  <div className="pbm-funnel-sub">aguardando chip</div>
                </div>

                <div className="pbm-funnel-card">
                  <span className="pbm-funnel-step">Etapa 3</span>
                  <div className="pbm-funnel-label">Com Número</div>
                  <div className="pbm-funnel-value">{funilStats.comNumero}</div>
                  <div className="pbm-funnel-sub">pronto p/ aquecer</div>
                </div>

                <div className="pbm-funnel-card">
                  <span className="pbm-funnel-step">Etapa 4</span>
                  <div className="pbm-funnel-label">Já Dispararam</div>
                  <div className="pbm-funnel-value">{funilStats.jaDispararam}</div>
                  <div className="pbm-funnel-sub">com dados de envio</div>
                </div>

                <div className="pbm-funnel-card">
                  <span className="pbm-funnel-step">Etapa 5</span>
                  <div className="pbm-funnel-label">Já Receberam</div>
                  <div className="pbm-funnel-value">—</div>
                  <div className="pbm-funnel-sub">Em breve (webhooks)</div>
                </div>
              </div>

              {conexoesFiltradas.length === 0 && (
                <div className="pbm-empty-box">
                  <div className="pbm-empty-icon"><GitMerge size={28} /></div>
                  <div className="pbm-empty-title">Nenhuma BM no filtro selecionado</div>
                  <div className="pbm-empty-desc">Conecte uma BM ou altere o filtro acima para visualizar o funil.</div>
                </div>
              )}
            </div>

            {/* TABELA DE METAS DIÁRIAS */}
            <div className="pbm-card">
              <div className="pbm-card-header">
                <div>
                  <h3 className="pbm-card-title">Plano de Volume Diário</h3>
                  <p className="pbm-card-sub">Meta de envios por dia em cada etapa. Valores iniciais são sugestões; ajuste conforme a esteira da sua agência.</p>
                </div>
              </div>

              <div className="pbm-table-container">
                <table className="pbm-table">
                  <thead>
                    <tr>
                      <th style={{ width: '22%' }}>Etapa</th>
                      <th>O que fazer</th>
                      <th style={{ width: '140px', textAlign: 'center' }}>Meta por dia</th>
                      <th style={{ width: '100px', textAlign: 'right' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aquecimentoConfig.map(row => (
                      <tr key={row.etapa}>
                        <td><strong>{row.etapa}</strong></td>
                        <td style={{ color: 'var(--text-muted)' }}>{row.o_que_fazer}</td>
                        <td style={{ textAlign: 'center' }}>
                          <input
                            type="number"
                            className="pbm-input-meta"
                            value={metas[row.etapa] ?? row.meta_diaria}
                            onChange={e => setMetas({ ...metas, [row.etapa]: e.target.value })}
                          />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="pbm-btn-save-sm"
                            disabled={savingMeta[row.etapa]}
                            onClick={() => handleSaveMeta(row.etapa)}
                          >
                            <Save size={12} />
                            <span>{savingMeta[row.etapa] ? 'Salvando...' : 'Salvar'}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 4. TEMPLATES */}
        {subTab === 'templates' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="pbm-page-header">
              <div className="pbm-page-tag">CATÁLOGO DE TEMPLATES</div>
              <h3 className="pbm-page-title">Templates de Mensagens WhatsApp</h3>
              <p className="pbm-page-desc">Monitore aprovações, categorias e motivos de rejeição da Meta para cada template.</p>
            </div>

            {search && (
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Filter size={13} />
                <span>Filtrando por: <strong>"{search}"</strong> ({todosTemplates.length} template(s))</span>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}
                  onClick={() => setSearch('')}
                >
                  Limpar filtro
                </button>
              </div>
            )}

            {todosTemplates.length === 0 ? (
              <div className="pbm-card">
                <div className="pbm-empty-box">
                  <div className="pbm-empty-icon"><FileText size={32} /></div>
                  <div className="pbm-empty-title">Nenhum template encontrado</div>
                  <div className="pbm-empty-desc">Conecte uma BM ou sincronize para listar os templates cadastrados.</div>
                </div>
              </div>
            ) : (
              <div className="pbm-table-container">
                <table className="pbm-table">
                  <thead>
                    <tr>
                      <th>Nome do Template</th>
                      <th>Categoria</th>
                      <th>Idioma</th>
                      <th>BM / WABA</th>
                      <th>Status Aprovação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todosTemplates.map(t => (
                      <tr key={t.id}>
                        <td>
                          <strong>{t.name}</strong>
                          {t.rejected_reason && (
                            <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <AlertCircle size={11} />
                              <span>Motivo: {t.rejected_reason}</span>
                            </div>
                          )}
                        </td>
                        <td><span className="pbm-badge neutral">{t.category}</span></td>
                        <td>{t.language}</td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{t.bmNome}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.wabaNome || t.wabaId}</div>
                        </td>
                        <td>
                          <span className={`pbm-badge ${t.status === 'APPROVED' ? 'approved' : (t.status === 'REJECTED' ? 'rejected' : 'pending')}`}>
                            {t.status === 'APPROVED' ? 'Aprovado' : (t.status === 'REJECTED' ? 'Rejeitado' : t.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 5. CONEXÕES BMs */}
        {subTab === 'conexoes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="pbm-page-header">
              <div className="pbm-page-tag">CONFIGURAÇÕES DE ACESSO</div>
              <h3 className="pbm-page-title">Conexões de BMs (Meta Graph API)</h3>
              <p className="pbm-page-desc">Cada conexão representa uma BM lida através do Token de Usuário do Sistema (permissão somente leitura).</p>
            </div>

            {/* BMs CONECTADAS */}
            <div className="pbm-card">
              <div className="pbm-card-header">
                <div>
                  <h3 className="pbm-card-title">BMs Conectadas ({conexoes.length})</h3>
                  <p className="pbm-card-sub">Contas ativas sincronizando periodicamente.</p>
                </div>
              </div>

              {conexoes.length === 0 ? (
                <div className="pbm-empty-box">
                  <div className="pbm-empty-icon"><Plug size={32} /></div>
                  <div className="pbm-empty-title">Nenhuma BM conectada</div>
                  <div className="pbm-empty-desc">Conecte a BM da sua organização abaixo para o painel começar a ler contas, números e volume.</div>
                </div>
              ) : (
                <div>
                  {conexoes.map(c => (
                    <div key={c.id} className="pbm-connection-card">
                      <div className="pbm-conn-info">
                        <div className="pbm-conn-name">
                          <span>{c.nome}</span>
                          <span className="pbm-badge green">Ativa</span>
                          <span className="pbm-badge neutral">
                            {c.tipo === 'agencia' ? 'Da agência' : 'Do cliente'}
                          </span>
                        </div>
                        <div className="pbm-conn-meta">
                          <span><strong>ID BM:</strong> {c.bm_id}</span>
                          <span><strong>Token:</strong> <code>{c.token_mascarado}</code></span>
                          <span><strong>Contas WABA:</strong> {c.dados?.wabas?.length || 0}</span>
                          <span><strong>Números:</strong> {c.dados?.totalNumeros || 0}</span>
                        </div>
                      </div>

                      <div className="pbm-conn-actions">
                        <button
                          className="pbm-btn-icon-danger"
                          title="Remover conexão"
                          onClick={() => handleDeleteBm(c.id, c.nome)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CONECTAR NOVA BM */}
            <div className="pbm-card">
              <div className="pbm-card-header">
                <div>
                  <h3 className="pbm-card-title">Conectar uma Nova BM</h3>
                  <p className="pbm-card-sub">O painel realiza apenas leituras: contas, números, templates e limites. Ele nunca envia mensagens por aqui.</p>
                </div>
              </div>

              {formMsg && (
                <div className={`pbm-alert-banner ${formMsg.type === 'error' ? 'danger' : 'warning'}`} style={{ marginBottom: 16 }}>
                  {formMsg.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
                  <div className="pbm-alert-text">
                    <h4>{formMsg.type === 'error' ? 'Erro na Conexão' : 'Sucesso'}</h4>
                    <p>{formMsg.text}</p>
                  </div>
                </div>
              )}

              <div className="pbm-connect-grid">
                <form onSubmit={handleConnectBm}>
                  <div className="pbm-form-group">
                    <label className="pbm-label">Nome da Conexão</label>
                    <input
                      type="text"
                      className="pbm-input"
                      placeholder="Ex: BM Matriz Agência"
                      value={formNome}
                      onChange={e => setFormNome(e.target.value)}
                    />
                    <div className="pbm-helper">Identificador visual para você reconhecer essa BM no painel.</div>
                  </div>

                  <div className="pbm-form-group">
                    <label className="pbm-label">ID da BM (Business Manager ID) <span className="pbm-required">*</span></label>
                    <input
                      type="text"
                      className="pbm-input"
                      placeholder="Ex: 123456789012345"
                      required
                      value={formBmId}
                      onChange={e => setFormBmId(e.target.value)}
                    />
                    <div className="pbm-helper">Encontrado em: Configurações do negócio → Informações do negócio.</div>
                  </div>

                  <div className="pbm-form-group">
                    <label className="pbm-label">Tipo de Conexão</label>
                    <select
                      className="pbm-input"
                      value={formTipo}
                      onChange={e => setFormTipo(e.target.value as any)}
                    >
                      <option value="agencia">Da agência</option>
                      <option value="cliente">Dos clientes</option>
                    </select>
                  </div>

                  <div className="pbm-form-group">
                    <label className="pbm-label">Token do Usuário do Sistema <span className="pbm-required">*</span></label>
                    <input
                      type="password"
                      className="pbm-input"
                      placeholder="EAAB..."
                      required
                      value={formToken}
                      onChange={e => setFormToken(e.target.value)}
                    />
                    <div className="pbm-helper">Armazenado com segurança e nunca exposto.</div>
                  </div>

                  <button
                    type="submit"
                    className="pbm-btn-primary"
                    disabled={formSubmitting}
                  >
                    {formSubmitting ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        <span>Testando e conectando...</span>
                      </>
                    ) : (
                      <>
                        <Plug size={15} />
                        <span>Testar e Conectar</span>
                      </>
                    )}
                  </button>
                </form>

                <div className="pbm-instructions-box">
                  <div className="pbm-inst-title">
                    <HelpCircle size={16} color="var(--primary-color)" />
                    <span>Como gerar o token na Meta</span>
                  </div>

                  <ol className="pbm-inst-steps">
                    <li>Acesse <strong>business.facebook.com</strong> → Configurações do negócio → <strong>Usuários do sistema</strong>.</li>
                    <li>Crie um usuário do sistema (com função de Administrador) e adicione as Contas do WhatsApp aos Ativos dele com controle total.</li>
                    <li>Clique em <strong>Gerar novo token</strong> e selecione o aplicativo da organização.</li>
                    <li>
                      Selecione as permissões obrigatórias:<br />
                      <code>whatsapp_business_management</code> e <code>business_management</code>.
                    </li>
                    <li>Escolha a validade <strong>Nunca expira</strong> (token permanente) e copie o código gerado.</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 6. ALERTAS & SEGURANÇA */}
        {subTab === 'alertas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="pbm-page-header">
              <div className="pbm-page-tag">CENTRAL DE SEGURANÇA</div>
              <h3 className="pbm-page-title">Alertas de Risco &amp; Notificações Meta</h3>
              <p className="pbm-page-desc">Histórico de advertências da Meta, quedas de qualidade de chips e templates rejeitados.</p>
            </div>

            {alertas.length === 0 ? (
              <div className="pbm-card">
                <div className="pbm-empty-box">
                  <div className="pbm-empty-icon" style={{ color: '#16a34a' }}>
                    <CheckCircle size={36} />
                  </div>
                  <div className="pbm-empty-title" style={{ color: '#15803d' }}>
                    Tudo em ordem!
                  </div>
                  <div className="pbm-empty-desc">
                    Nenhuma notificação crítica ou número com qualidade baixa registrado no momento.
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {alertas.map(a => (
                  <div key={a.id} className={`pbm-alert-banner ${a.severidade === 'critico' ? 'danger' : 'warning'}`}>
                    {a.severidade === 'critico' ? <AlertTriangle size={20} /> : <AlertCircle size={20} />}
                    <div className="pbm-alert-text" style={{ flex: 1 }}>
                      <h4>{a.titulo}</h4>
                      <p>{a.mensagem}</p>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                        Registrado em: {new Date(a.created_at).toLocaleString('pt-BR')}
                      </div>
                    </div>
                    <button
                      className="pbm-btn-save-sm"
                      onClick={() => handleResolverAlerta(a.id)}
                    >
                      Marcar como lido
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
