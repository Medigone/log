"""Relance le rattrapage si le patch initial a été ignoré (mauvais table_exists)."""

from log.patches.v1_0.sync_driver_cash_from_declared_payments import execute as sync_declared_cash


def execute():
	sync_declared_cash()
