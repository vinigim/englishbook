-- ============================================================================
-- ENGLISHBOOK - FUNÇÃO: marcar bookings antigos como completed
-- ============================================================================
-- Chamada pelo cron /api/cron/complete-past-bookings (1x/hora).
-- Marca como 'completed' todo booking 'confirmed' cujo scheduled_end_at
-- já passou. Retorna quantos foram atualizados (útil pra logs).
-- ============================================================================

create or replace function complete_past_bookings() returns integer as $$
declare
  v_count integer;
begin
  with updated as (
    update bookings
      set status = 'completed', completed_at = now()
      where status = 'confirmed'
        and scheduled_end_at < now()
      returning id
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$ language plpgsql security definer;
