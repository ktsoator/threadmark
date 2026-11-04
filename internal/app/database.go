package app

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"syscall"

	"github.com/glebarez/sqlite"
	"github.com/ktsoator/threadmark/project"
	projectdatabase "github.com/ktsoator/threadmark/project/database"
	"google.golang.org/adk/v2/session"
	"google.golang.org/adk/v2/session/database"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type storage struct {
	db       *gorm.DB
	sessions session.Service
	projects project.Service
	cfg      Config
	close    func() error
}

func openStorage(cfg Config) (_ *storage, retErr error) {
	var err error
	if cfg.DataDir == "" {
		cfg.DataDir, err = dataDirectory()
		if err != nil {
			return nil, err
		}
	}
	cfg.DataDir, err = filepath.Abs(cfg.DataDir)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(cfg.DataDir, 0700); err != nil {
		return nil, err
	}
	cfg.DataDir, err = filepath.EvalSymlinks(cfg.DataDir)
	if err != nil {
		return nil, err
	}
	if cfg.DBPath == "" {
		cfg.DBPath = filepath.Join(cfg.DataDir, "threadmark.db")
	} else {
		cfg.DBPath, err = filepath.Abs(cfg.DBPath)
		if err != nil {
			return nil, err
		}
	}
	if err := os.MkdirAll(filepath.Dir(cfg.DBPath), 0700); err != nil {
		return nil, err
	}
	// Resolve the parent even when the database has not been created yet.
	parent, err := filepath.EvalSymlinks(filepath.Dir(cfg.DBPath))
	if err != nil {
		return nil, err
	}
	cfg.DBPath = filepath.Join(parent, filepath.Base(cfg.DBPath))
	if info, err := os.Lstat(cfg.DBPath); err == nil && info.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("database path must not be a symbolic link")
	}
	var locks []*os.File
	unlock := func() {
		for i := len(locks) - 1; i >= 0; i-- {
			_ = locks[i].Close()
		}
	}
	defer func() {
		if retErr != nil {
			unlock()
		}
	}()
	for _, path := range []string{filepath.Join(cfg.DataDir, ".instance.lock"), cfg.DBPath + ".lock"} {
		file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0600)
		if err != nil {
			return nil, err
		}
		if err := syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
			_ = file.Close()
			return nil, fmt.Errorf("another Threadmark backend is using this data directory or database")
		}
		locks = append(locks, file)
	}
	root := filepath.Join(cfg.DataDir, "workspaces")
	if err := os.MkdirAll(root, 0700); err != nil {
		return nil, err
	}
	if real, err := filepath.EvalSymlinks(root); err != nil || real != root {
		return nil, fmt.Errorf("managed workspaces root must not be a symbolic link")
	}
	db, err := openDatabase(cfg.DBPath)
	if err != nil {
		return nil, err
	}
	defer func() {
		if retErr != nil {
			_ = closeDatabase(db)
		}
	}()
	sessions, err := database.NewSessionServiceFromDB(db)
	if err != nil {
		return nil, err
	}
	if err := database.AutoMigrate(sessions); err != nil {
		return nil, err
	}
	projectService, err := projectdatabase.NewService(projectdatabase.Config{DB: db, ReservedDirectories: []string{root}})
	if err != nil {
		return nil, err
	}
	var once sync.Once
	var closeErr error
	return &storage{db: db, sessions: sessions, projects: projectService, cfg: cfg, close: func() error {
		once.Do(func() { closeErr = closeDatabase(db); unlock() })
		return closeErr
	}}, nil
}

func openDatabase(path string) (*gorm.DB, error) {
	u := url.URL{Scheme: "file", Path: filepath.ToSlash(path)}
	u.RawQuery = "_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)"
	db, err := gorm.Open(sqlite.Open(u.String()), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		return nil, err
	}
	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(1)
	return db, nil
}

func closeDatabase(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}
