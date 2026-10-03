"""Pick Lists : allocation des lots par date de péremption (FEFO) au lieu de FIFO."""

from log.setup.stock_settings import ensure_expiry_threshold, ensure_fefo_batch_picking


def execute():
	ensure_fefo_batch_picking()
	ensure_expiry_threshold()
